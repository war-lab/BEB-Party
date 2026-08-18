// DETECTIVESの事件データ検証。検証8項目・追加リント・5人版導出・反例出力を実装する。
// 何を・なぜ検証するかは基本設計/04、どう判定するかは基本設計/06を正とする。
//
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（05）。
import { explain, isRequired, saturate, type Rule, type Saturation } from "@beb/engine";
import type { ValidationResult } from "@beb/shared-core";
import type { Case, Fact, PlayerCountVariant, Variant } from "@beb/shared-detectives";
import { indexFacts, parseCase, yieldsOf } from "./case-schema";
import { derive5p, has5p } from "./derive-5p";

/** 検証項目。1〜8は04・06の検証項目、それ以外は前提となる構造検証とリント */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | "schema" | "merge5p" | "lint";

export interface Finding {
  caseId: string;
  /** 犯人のキャラクターid。バリアント横断の項目はnull */
  variant: string | null;
  /** 人数版。人数版横断の項目はnull */
  playerCount: PlayerCountVariant | null;
  item: ValidationItem;
  severity: "error" | "warning";
  message: string;
  /** 06の反例出力の表に対応する情報 */
  detail: string[];
}

export interface ValidationReport {
  caseId: string;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

/** 1つの検証インスタンス（バリアント1つ × 人数版1つ） */
interface Instance {
  target: Case;
  playerCount: PlayerCountVariant;
  variant: Variant;
  /** 嘘あり集合 */
  lieSymbols: Set<string>;
  /** 正直集合（検証4で使う） */
  honestSymbols: Set<string>;
  rules: Rule[];
  yields: string[];
  lieSymbol: string;
  /** シンボル -> 事実。嘘のシンボルは差し替え元の事実へ対応させる */
  factOfSymbol: Map<string, Fact>;
}

class Findings {
  readonly items: Finding[] = [];

  constructor(private readonly caseId: string) {}

  error(item: ValidationItem, scope: { variant: string | null; playerCount: PlayerCountVariant | null }, message: string, detail: string[] = []): void {
    this.items.push({ caseId: this.caseId, item, severity: "error", message, detail, ...scope });
  }

  warn(item: ValidationItem, scope: { variant: string | null; playerCount: PlayerCountVariant | null }, message: string, detail: string[] = []): void {
    this.items.push({ caseId: this.caseId, item, severity: "warning", message, detail, ...scope });
  }
}

const CASE_WIDE = { variant: null, playerCount: null };

/**
 * requiresの参照（fact idまたは他の矛盾のyields）を推論エンジンのシンボルへ解決する。
 *
 * 規則はそれを書いたバリアントの嘘置換で解決する。犯人以外の事実は正直な値のままとする。
 * この解決規則により、他バリアントの規則は「その人が嘘をついた世界」でしか発火しない（検証7）。
 */
function resolveSymbol(reference: string, variant: Variant, factById: Map<string, Fact>): string {
  if (reference === variant.lie.replaces) {
    return variant.lie.value;
  }
  const fact = factById.get(reference);
  return fact === undefined ? reference : fact.value;
}

function resolveRules(variant: Variant, factById: Map<string, Fact>): Rule[] {
  return variant.contradictions.map((contradiction, index) => ({
    id: `${variant.culprit}#${index}`,
    requires: contradiction.requires.map((reference) => resolveSymbol(reference, variant, factById)),
    yields: contradiction.yields,
  }));
}

function buildInstance(target: Case, playerCount: PlayerCountVariant, variant: Variant): Instance {
  const factById = indexFacts(target);
  const factOfSymbol = new Map<string, Fact>();
  const lieSymbols = new Set<string>();
  const honestSymbols = new Set<string>();

  for (const fact of target.facts) {
    honestSymbols.add(fact.value);
    factOfSymbol.set(fact.value, fact);
    lieSymbols.add(fact.id === variant.lie.replaces ? variant.lie.value : fact.value);
  }
  const replaced = factById.get(variant.lie.replaces);
  if (replaced !== undefined) {
    factOfSymbol.set(variant.lie.value, replaced);
  }

  return {
    target,
    playerCount,
    variant,
    lieSymbols,
    honestSymbols,
    rules: resolveRules(variant, factById),
    yields: yieldsOf(variant),
    lieSymbol: variant.lie.value,
    factOfSymbol,
  };
}

/** 規則のrequiresを推移的に展開し、末端のシンボル（事実由来）を返す */
function expandLeaves(saturation: Saturation, rules: Rule[], requires: string[]): Set<string> {
  const leaves = new Set<string>();
  for (const symbol of requires) {
    if (saturation.support.has(symbol)) {
      for (const leaf of explain(saturation, rules, symbol).leaves) {
        leaves.add(leaf);
      }
    } else {
      leaves.add(symbol);
    }
  }
  return leaves;
}

// --- 検証8項目 ---

/** 検証1: 可解性。嘘あり集合の到達集合がyieldsを1つ以上含む */
function checkSolvable(instance: Instance, findings: Findings): boolean {
  const saturation = saturate(instance.lieSymbols, instance.rules);
  const reached = instance.yields.filter((symbol) => saturation.reached.has(symbol));
  if (reached.length > 0) {
    return true;
  }

  // 反例: 到達集合と、発火しなかった規則ごとの不足シンボル
  const missing = instance.rules
    .filter((rule) => !saturation.fired.includes(rule.id))
    .map((rule) => {
      const lack = rule.requires.filter((symbol) => !saturation.reached.has(symbol));
      return `規則 ${rule.id} の不足シンボル: ${lack.join(", ")}`;
    });
  findings.error(1, scopeOf(instance), "嘘あり集合からyieldsに到達しない（可解性）", [
    `到達集合: ${[...saturation.reached].sort().join(", ")}`,
    ...missing,
  ]);
  return false;
}

/** 検証2: 全員必須。犯人以外の各キャラクターの全事実を除くと検証1が不成立になる */
function checkEveryoneRequired(instance: Instance, findings: Findings): void {
  const survivors: string[] = [];

  for (const character of instance.target.characters) {
    // 犯人自身を除いたケースは検査対象から外す。犯人を除くと嘘の事実も消え、
    // 検証1は必ず不成立になるため、合格として数えると検証2が空回りする（06）
    if (character.id === instance.variant.culprit) {
      continue;
    }
    const drop = instance.target.facts
      .filter((fact) => fact.owner === character.id)
      .map((fact) => (fact.id === instance.variant.lie.replaces ? instance.variant.lie.value : fact.value));
    if (drop.length === 0) {
      continue;
    }
    const stillReachable = instance.yields.filter(
      (symbol) => !isRequired(instance.lieSymbols, instance.rules, symbol, drop),
    );
    if (stillReachable.length > 0) {
      survivors.push(`${character.id}（到達し続けるyields: ${stillReachable.join(", ")}）`);
    }
  }

  if (survivors.length > 0) {
    findings.error(2, scopeOf(instance), "証言を除いても犯人に到達できるキャラクターがある（全員必須）", survivors);
  }
}

/** 検証3: 単独不可。発火した各規則が犯人以外2人以上・事実2つ以上を要求する */
function checkNotSolvableAlone(instance: Instance, findings: Findings): void {
  const saturation = saturate(instance.lieSymbols, instance.rules);

  for (const rule of instance.rules) {
    if (!saturation.fired.includes(rule.id)) {
      continue;
    }
    const leaves = expandLeaves(saturation, instance.rules, rule.requires);
    const facts: Fact[] = [];
    for (const leaf of leaves) {
      // 嘘factは頭数に数えない（04）。数えると犯人1人 + 他者1人で条件を満たしてしまう
      if (leaf === instance.lieSymbol) {
        continue;
      }
      const fact = instance.factOfSymbol.get(leaf);
      if (fact !== undefined && fact.owner !== instance.variant.culprit) {
        facts.push(fact);
      }
    }
    const owners = new Set(facts.map((fact) => fact.owner));
    if (facts.length < 2 || owners.size < 2) {
      findings.error(3, scopeOf(instance), `規則 ${rule.id} が犯人以外2人以上の証言を要求していない（単独不可）`, [
        `展開後の事実: ${facts.map((fact) => `${fact.id}(${fact.owner})`).join(", ") || "なし"}`,
        `所有者: ${[...owners].sort().join(", ") || "なし"}`,
      ]);
    }
  }
}

/** 検証4: 冤罪なし。正直集合からはyieldsが1つも導出されない */
function checkNoFalseAccusation(instance: Instance, findings: Findings): void {
  // 嘘factを含まないrequiresは、正直な証言だけで発火しうる（ADR-0008）。
  // 発火の有無より先に規約違反として報告する。反例が「どの矛盾を直すか」に直結するためである
  instance.variant.contradictions.forEach((contradiction, index) => {
    if (!contradiction.requires.includes(instance.variant.lie.replaces)) {
      findings.error(4, scopeOf(instance), `矛盾 ${instance.variant.culprit}#${index} のrequiresが嘘fact ${instance.variant.lie.replaces} を含まない（ADR-0008）`, [
        `requires: ${contradiction.requires.join(", ")}`,
      ]);
    }
  });

  const saturation = saturate(instance.honestSymbols, instance.rules);
  const reached = instance.yields.filter((symbol) => saturation.reached.has(symbol));
  if (reached.length === 0) {
    return;
  }

  const fired = instance.rules
    .filter((rule) => saturation.fired.includes(rule.id))
    .map((rule) => {
      const satisfiedBy = rule.requires
        .map((symbol) => instance.factOfSymbol.get(symbol)?.id ?? symbol)
        .join(", ");
      return `規則 ${rule.id} を満たした事実: ${satisfiedBy}`;
    });
  findings.error(4, scopeOf(instance), "正直な証言だけで矛盾が発火する（冤罪なし）", [
    `導出されたyields: ${reached.join(", ")}`,
    ...fired,
  ]);
}

/** 検証7: バリアント非干渉。他バリアントのcontradictionsを適用しても発火しない */
function checkNoVariantInterference(instance: Instance, findings: Findings): void {
  const factById = indexFacts(instance.target);

  for (const other of instance.target.variants) {
    if (other.culprit === instance.variant.culprit) {
      continue;
    }
    const otherRules = resolveRules(other, factById);
    const saturation = saturate(instance.lieSymbols, otherRules);
    const reached = yieldsOf(other).filter((symbol) => saturation.reached.has(symbol));
    if (reached.length === 0) {
      continue;
    }
    findings.error(7, scopeOf(instance), `他バリアント（犯人 ${other.culprit}）の矛盾が同時に発火する（バリアント非干渉）`, [
      `干渉したバリアントの犯人: ${other.culprit}`,
      `発火した規則: ${saturation.fired.join(", ")}`,
      `導出されたyields: ${reached.join(", ")}`,
    ]);
  }
}

/**
 * 検証8: 犯人の手札に必須カードを置かない。
 *
 * 発火した規則が、嘘fact以外に犯人自身が所有する事実を要求していないことを見る。
 * 要求していると、犯人はその1枚を出さないだけで矛盾の成立を止められる。
 * 証言の開示は `disclosure` が `free` でも義務ではないため、黙秘は反則ではない。
 *
 * 5人版で統合先が犯人になる回で起きやすい。統合されたキャラクターの証言が犯人の手札へ移るためである。
 * 検証3は犯人所有の事実を頭数から除くだけで存在を許し、検証2は犯人自身を検査対象から外すため、
 * どちらもこの形を検出しない。
 */
function checkNoCulpritHeldEvidence(instance: Instance, findings: Findings): void {
  const saturation = saturate(instance.lieSymbols, instance.rules);

  for (const rule of instance.rules) {
    if (!saturation.fired.includes(rule.id)) {
      continue;
    }
    const held: Fact[] = [];
    for (const leaf of expandLeaves(saturation, instance.rules, rule.requires)) {
      if (leaf === instance.lieSymbol) {
        continue;
      }
      const fact = instance.factOfSymbol.get(leaf);
      if (fact !== undefined && fact.owner === instance.variant.culprit) {
        held.push(fact);
      }
    }
    if (held.length > 0) {
      findings.error(8, scopeOf(instance), `規則 ${rule.id} が犯人自身の証言を要求している（犯人が黙ると矛盾に到達できない）`, [
        `犯人が持つ必須の事実: ${held.map((fact) => fact.id).join(", ")}`,
        instance.playerCount === "5p"
          ? "統合で犯人の手札へ移った証言と思われる。requires5pで別の組に置き換える"
          : "requiresから外すか、別のキャラクターの証言に置き換える",
      ]);
    }
  }
}

/** 検証6: 表示完全性。全事実（嘘を含む）とbriefing・revealの表示テキストが揃っている */
function checkDisplayCompleteness(target: Case, findings: Findings): void {
  const missing: string[] = [];
  const levels = ["1", "2", "3", "4", "5"] as const;

  const checkText = (text: unknown, path: string): void => {
    if (typeof text !== "object" || text === null) {
      missing.push(path);
      return;
    }
    const record = text as Record<string, unknown>;
    for (const level of levels) {
      const line = record[level];
      if (typeof line !== "string" || line.trim().length === 0) {
        missing.push(`${path}["${level}"]`);
      }
    }
  };
  const checkString = (value: unknown, path: string): void => {
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push(path);
    }
  };

  target.facts.forEach((fact, index) => {
    checkText(fact.text, `facts[${index}].text`);
    checkString(fact.hintJa, `facts[${index}].hintJa`);
  });
  target.variants.forEach((variant, index) => {
    checkText(variant.lie.text, `variants[${index}].lie.text`);
    checkString(variant.lie.hintJa, `variants[${index}].lie.hintJa`);
  });
  checkString(target.briefing?.ja, "briefing.ja");
  checkString(target.briefing?.en, "briefing.en");

  if (!Array.isArray(target.reveal?.timelineEn) || target.reveal.timelineEn.length === 0) {
    missing.push("reveal.timelineEn");
  } else {
    target.reveal.timelineEn.forEach((line, index) => checkString(line, `reveal.timelineEn[${index}]`));
  }
  if (!Array.isArray(target.reveal?.keyExpressions) || target.reveal.keyExpressions.length === 0) {
    missing.push("reveal.keyExpressions");
  } else {
    target.reveal.keyExpressions.forEach((expression, index) => {
      checkString(expression?.en, `reveal.keyExpressions[${index}].en`);
      checkString(expression?.ja, `reveal.keyExpressions[${index}].ja`);
    });
  }

  if (missing.length > 0) {
    findings.error(6, CASE_WIDE, "表示テキストが欠けている（表示完全性）", missing);
  }
}

/** 検証5: 未使用なし。各事実が、いずれかのインスタンスで発火した規則の推移的requiresに現れる */
function checkNoUnusedFacts(target: Case, instances: Instance[], findings: Findings): void {
  const used = new Set<string>();

  for (const instance of instances) {
    const saturation = saturate(instance.lieSymbols, instance.rules);
    for (const rule of instance.rules) {
      if (!saturation.fired.includes(rule.id)) {
        continue;
      }
      for (const leaf of expandLeaves(saturation, instance.rules, rule.requires)) {
        const fact = instance.factOfSymbol.get(leaf);
        if (fact !== undefined) {
          used.add(fact.id);
        }
      }
    }
  }

  const unused = target.facts.filter((fact) => !used.has(fact.id)).map((fact) => `${fact.id}(${fact.owner})`);
  if (unused.length > 0) {
    findings.error(5, CASE_WIDE, "どのインスタンスでも使われない事実がある（未使用なし）", unused);
  }
}

/**
 * 5人版の設計漏れ検出。
 *
 * 統合によって規則のrequiresに含まれる事実の所有者が犯人以外1人になり、
 * かつrequires5pが未指定の場合は検証エラーとする（04）。
 */
function checkMergeDesign(base: Case, findings: Findings): void {
  const derived = derive5p(base);
  const ownerOf = new Map(derived.facts.map((fact) => [fact.id, fact.owner]));
  const mergedAway = new Set(base.characters.filter((c) => c.merge5p !== null).map((c) => c.id));

  for (const variant of base.variants) {
    if (mergedAway.has(variant.culprit)) {
      continue;
    }
    variant.contradictions.forEach((contradiction, index) => {
      if (contradiction.requires5p !== null) {
        return;
      }
      const owners = new Set(
        contradiction.requires
          .map((reference) => ownerOf.get(reference))
          .filter((owner): owner is string => owner !== undefined && owner !== variant.culprit),
      );
      if (owners.size === 1) {
        findings.error(
          "merge5p",
          { variant: variant.culprit, playerCount: "5p" },
          `統合により矛盾 ${variant.culprit}#${index} のrequiresの所有者が犯人以外1人になる。requires5pを指定する必要がある`,
          [`統合後の所有者: ${[...owners].join(", ")}`, `requires: ${contradiction.requires.join(", ")}`],
        );
      }
    });
  }
}

/** 敬称。呼び名の照合では取り除く */
const HONORIFICS = new Set(["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]);

/** 表示名から照合用の呼び名を作る。"Mr. Ito (campus guard)" なら ["Mr. Ito", "Ito"] */
function nameLabels(displayName: string): string[] {
  // "Aoi (part-time staff)" も "Yuki(kitchen staff)" も "アオイ（店員）" も同じ扱いにする
  const head = displayName.split(/\s*[（(]/)[0]?.trim() ?? displayName;
  const words = head.split(/\s+/).filter((word) => !HONORIFICS.has(word) && word.length >= 2);
  return [...new Set([head, ...words])];
}

/** 単語境界つきの出現判定。Ken が Kenji に一致しないようにする（日本語の直後は境界として扱う） */
function mentions(text: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`).test(text);
}

/**
 * 5人版で卓から消えるキャラクターの名前が `meaningJa` に残っていないかを見る。
 *
 * 統合されたキャラクターの証言は統合先の手札に入るが、`meaningJa` の文面は変わらない。
 * そのままだと開示画面の解説に、その卓にいない人物の名前が出る。
 * 統合されたキャラクター自身が犯人のバリアントは5人版に存在しない（06の手順4）ため対象から除く。
 */
function checkMergedNamesInMeaning(base: Case, findings: Findings): void {
  const merged = base.characters.filter((character) => character.merge5p !== null);
  // 5人版に残るキャラクターの呼び名。姓を共有する別人（Mr. Sato と Ms. Sato）で誤検出しないよう、
  // 衝突する語はラベルから外す
  const survivingLabels = new Set(
    base.characters.filter((character) => character.merge5p === null).flatMap((character) => nameLabels(character.name)),
  );

  for (const character of merged) {
    const labels = nameLabels(character.name).filter((label) => !survivingLabels.has(label));
    if (labels.length === 0) {
      continue;
    }

    const report = (
      where: string,
      text: string,
      scope: { variant: string | null; playerCount: PlayerCountVariant | null },
    ): void => {
      const hit = labels.find((label) => mentions(text, label));
      if (hit === undefined) {
        return;
      }
      findings.error(
        "merge5p",
        scope,
        `${where} に、5人版では卓にいない ${character.id} の名前が出る`,
        [`該当する呼び名: ${hit}`, `本文: ${text}`],
      );
    };

    for (const variant of base.variants) {
      if (variant.culprit === character.id) {
        continue;
      }
      variant.contradictions.forEach((contradiction, index) => {
        report(`矛盾 ${variant.culprit}#${index} のmeaningJa`, contradiction.meaningJa, {
          variant: variant.culprit,
          playerCount: "5p",
        });
      });
    }

    // 開示画面に出るのはmeaningJaだけではない（08のresult）
    const caseWide = { variant: null, playerCount: "5p" as PlayerCountVariant };
    base.reveal.timelineEn.forEach((line, index) => report(`reveal.timelineEn[${index}]`, line, caseWide));
    base.reveal.keyExpressions.forEach((entry, index) => {
      report(`reveal.keyExpressions[${index}].en`, entry.en, caseWide);
      report(`reveal.keyExpressions[${index}].ja`, entry.ja, caseWide);
    });
    report("briefing.ja", base.briefing.ja, caseWide);
    report("briefing.en", base.briefing.en, caseWide);
  }
}

// --- 追加リント（04） ---

/** valueを構成要素へ分解する。エンジンは解釈しないが、リントは表記の目安として使う */
function valueTokens(value: string): string[] {
  return value
    .split(/[=_\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

/** hintJaの本文（"en = 和訳" の左辺を除いた部分）。語義の並記は和訳の疑いから除外する */
function hintBody(hintJa: string): string {
  return hintJa
    .split("/")
    .map((part) => {
      const separator = part.indexOf("=");
      return separator >= 0 ? part.slice(separator + 1) : part;
    })
    .join(" ");
}

function lintHintJa(label: string, value: string, hintJa: string, findings: Findings): void {
  // 欠落は検証6が報告する。リントは存在する文字列だけを見る
  if (typeof hintJa !== "string") {
    return;
  }
  const body = hintBody(hintJa).toLowerCase();
  const tokens = valueTokens(value);
  const appeared = tokens.filter((token) => body.includes(token.toLowerCase()));
  const leakedLiteral = appeared.filter((token) => /\d/.test(token));

  if (leakedLiteral.length > 0) {
    findings.warn("lint", CASE_WIDE, `${label} のhintJaがvalueの数値・時刻を本文に含む（文全体の和訳になっていないか）`, [
      `hintJa: ${hintJa}`,
      `該当: ${leakedLiteral.join(", ")}`,
    ]);
    return;
  }
  if (appeared.length >= 2) {
    findings.warn("lint", CASE_WIDE, `${label} のhintJaがvalueの構成要素を2つ以上含む（語義のみにとどめる）`, [
      `hintJa: ${hintJa}`,
      `該当: ${appeared.join(", ")}`,
    ]);
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

function lintTextLength(label: string, text: Record<string, string>, findings: Findings): void {
  // 欠落は検証6が報告する
  const level1 = text?.["1"];
  const level5 = text?.["5"];
  if (typeof level1 === "string" && wordCount(level1) > 8) {
    findings.warn("lint", CASE_WIDE, `${label} のレベル1が8語を超える（${wordCount(level1)}語）`, [level1]);
  }
  if (typeof level5 === "string" && wordCount(level5) < 15) {
    findings.warn("lint", CASE_WIDE, `${label} のレベル5が15語未満である（${wordCount(level5)}語）`, [level5]);
  }
}

function runLints(base: Case, findings: Findings): void {
  // レベル1〜2のキャラクターが少なくとも1つの矛盾のrequiresに含まれる（初級者が推理に必須である）
  const referenced = new Set(base.variants.flatMap((variant) => variant.contradictions.flatMap((c) => c.requires)));
  for (const character of base.characters) {
    if (character.recommendedLevel > 2) {
      continue;
    }
    const owned = base.facts.filter((fact) => fact.owner === character.id);
    if (!owned.some((fact) => referenced.has(fact.id))) {
      findings.error("lint", CASE_WIDE, `レベル${character.recommendedLevel}のキャラクター ${character.id} の証言がどの矛盾にも使われていない`, [
        `所有する事実: ${owned.map((fact) => fact.id).join(", ") || "なし"}`,
      ]);
    }
  }

  for (const fact of base.facts) {
    lintHintJa(fact.id, fact.value, fact.hintJa, findings);
    lintTextLength(fact.id, fact.text, findings);
  }
  for (const variant of base.variants) {
    lintHintJa(`${variant.culprit}の嘘`, variant.lie.value, variant.lie.hintJa, findings);
    lintTextLength(`${variant.culprit}の嘘`, variant.lie.text, findings);
  }

  // 同じlie.valueを2つのバリアントが使うと、片方の世界にもう片方の嘘の値が存在する。
  // 相手のrequiresが揃わなければ検証7は発火しないため、機械検証をすり抜ける組み合わせが残る（06）
  const lieOwners = new Map<string, string[]>();
  for (const variant of base.variants) {
    lieOwners.set(variant.lie.value, [...(lieOwners.get(variant.lie.value) ?? []), variant.culprit]);
  }
  for (const [value, culprits] of lieOwners) {
    if (culprits.length > 1) {
      findings.error("lint", CASE_WIDE, `2つ以上のバリアントが同じlie.valueを使っている（検証7がすり抜ける組み合わせが残る）`, [
        `value: ${value}`,
        `該当する犯人: ${culprits.join(", ")}`,
      ]);
    }
  }

  // バリアント数がキャラクター数と一致しない場合の警告は6人版にのみ適用する（04）
  if (base.variants.length !== base.characters.length) {
    findings.warn("lint", CASE_WIDE, `バリアント数(${base.variants.length})とキャラクター数(${base.characters.length})が一致しない`, []);
  }
}

// --- 全体の組み立て ---

function scopeOf(instance: Instance): { variant: string; playerCount: PlayerCountVariant } {
  return { variant: instance.variant.culprit, playerCount: instance.playerCount };
}

function buildInstances(target: Case, playerCount: PlayerCountVariant): Instance[] {
  return target.variants.map((variant) => buildInstance(target, playerCount, variant));
}

/** 事件データを検証し、反例つきの結果を返す */
export function validateCase(content: unknown): ValidationReport {
  const parsed = parseCase(content);
  if (!parsed.ok) {
    const caseId = typeof (content as { id?: unknown })?.id === "string" ? (content as { id: string }).id : "(不明)";
    const findings = new Findings(caseId);
    for (const issue of parsed.issues) {
      findings.error("schema", CASE_WIDE, issue.message, [`パス: ${issue.path || "(ルート)"}`]);
    }
    return summarize(caseId, findings.items);
  }

  const base = parsed.value;
  const findings = new Findings(base.id);

  checkDisplayCompleteness(base, findings);
  runLints(base, findings);

  const allInstances: Instance[] = [];
  const versions: { playerCount: PlayerCountVariant; target: Case }[] = [{ playerCount: "6p", target: base }];
  if (has5p(base)) {
    checkMergeDesign(base, findings);
    checkMergedNamesInMeaning(base, findings);
    versions.push({ playerCount: "5p", target: derive5p(base) });
  } else if (base.playerCount[0] < base.characters.length) {
    // 下限人数を宣言しているのに統合指定がなければ、その人数では配役できない
    findings.error(
      "merge5p",
      { variant: null, playerCount: null },
      `playerCountの下限は${base.playerCount[0]}人だが、${base.characters.length}人から減らす統合指定（merge5p）がない`,
    );
  }

  for (const version of versions) {
    const instances = buildInstances(version.target, version.playerCount);
    if (instances.length === 0) {
      findings.error("schema", { variant: null, playerCount: version.playerCount }, "検証対象のバリアントが0件である");
      continue;
    }
    for (const instance of instances) {
      const solvable = checkSolvable(instance, findings);
      if (solvable) {
        checkEveryoneRequired(instance, findings);
        checkNotSolvableAlone(instance, findings);
        checkNoCulpritHeldEvidence(instance, findings);
      }
      checkNoFalseAccusation(instance, findings);
      checkNoVariantInterference(instance, findings);
    }
    allInstances.push(...instances);
  }

  checkNoUnusedFacts(base, allInstances, findings);

  return summarize(base.id, findings.items);
}

function summarize(caseId: string, findings: Finding[]): ValidationReport {
  return {
    caseId,
    findings,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
  };
}

/** 反例1件を1行で表す。事件id・バリアント・人数版・項目番号を必ず含める（06） */
export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const variant = finding.variant ?? "全バリアント";
  const playerCount = finding.playerCount ?? "全人数版";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.caseId} / ${variant} / ${playerCount} / ${item}: ${finding.message}`;
  const detail = finding.detail.map((line) => `    - ${line}`);
  return [head, ...detail].join("\n");
}

/** GameModule.validateContent 互換の入口。詳細な反例が要るCLIは validateCase を使う */
export function validateContent(content: unknown): ValidationResult {
  const report = validateCase(content);
  if (report.errorCount === 0) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: report.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => formatFinding(finding))
      .join("\n"),
  };
}
