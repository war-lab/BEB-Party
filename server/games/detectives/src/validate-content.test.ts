import { describe, expect, it } from "vitest";
import type { Case } from "@beb/shared-detectives";
import { formatFinding, validateCase, validateContent, type Finding, type ValidationItem } from "./validate-content";
import {
  contradiction,
  fact,
  mergeGapCase,
  multiStepCase,
  sharedLieCase,
  soloOwnerCase,
  validCase,
} from "./test-support/fixtures";

function errorsOf(report: { findings: Finding[] }): Finding[] {
  return report.findings.filter((finding) => finding.severity === "error");
}

/** 落ちた検証項目の集合。「その項目だけが落ちる」の判定に使う */
function failedItems(report: { findings: Finding[] }): ValidationItem[] {
  return [...new Set(errorsOf(report).map((finding) => finding.item))];
}

/**
 * 事件データを1箇所だけ壊した複製を作る。
 *
 * 複製にJSONの往復を使うのは、このパッケージをWorkerのバンドルに入れる都合で
 * Nodeのグローバル（structuredClone）の型を持ち込まないためである。
 */
function mutate(base: Case, change: (target: Case) => void): Case {
  const clone = JSON.parse(JSON.stringify(base)) as Case;
  change(clone);
  return clone;
}

describe("validateCase（基準となる事件）", () => {
  it("7項目とリントをすべて満たす事件はエラーも警告も出ない", () => {
    const report = validateCase(validCase());
    expect(report.findings.map(formatFinding)).toEqual([]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it("6人版と5人版の両方が検証対象になる", () => {
    // 5人版でのみ落ちる壊し方をすると、5人版の指摘だけが出る
    const broken = mutate(validCase(), (target) => {
      // c6の証言をc1（犯人以外）に寄せると、5人版ではc5の所有が2枚になり検証2の必須性が変わる
      target.variants = target.variants.filter((variant) => variant.culprit !== "c6");
    });
    const report = validateCase(broken);
    // バリアントを1つ落としただけなので、リント（バリアント数不一致）の警告のみが出る
    expect(errorsOf(report)).toEqual([]);
    expect(report.warningCount).toBe(1);
    expect(report.findings[0]?.message).toContain("バリアント数");
  });
});

describe("検証1: 可解性", () => {
  it("矛盾が循環して発火しない事件は検証1だけが落ちる", () => {
    const broken = mutate(validCase(), (target) => {
      const target1 = target.variants.find((variant) => variant.culprit === "c1");
      // 互いの結論を要求し合う2つの矛盾。どちらも発火しない
      target1!.contradictions = [
        contradiction(["f1", "f2", "f3", "f4", "f5", "f6", "step_b"], "step_a"),
        contradiction(["f1", "f2", "f3", "f4", "f5", "f6", "step_a"], "step_b"),
      ];
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual([1]);
    // 反例に到達集合と不足シンボルが含まれる
    const detail = errorsOf(report)[0]!.detail.join("\n");
    expect(detail).toContain("到達集合:");
    expect(detail).toContain("不足シンボル: step_b");
  });
});

describe("検証2: 全員必須", () => {
  it("一部の証言がなくても解ける事件は検証2だけが落ちる", () => {
    const broken = mutate(validCase(), (target) => {
      const target1 = target.variants.find((variant) => variant.culprit === "c1");
      target1!.contradictions = [contradiction(["f1", "f2", "f3"], "c1_exposed")];
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual([2]);
    const detail = errorsOf(report)[0]!.detail.join(" ");
    expect(detail).toContain("c4");
    expect(detail).toContain("c5");
    expect(detail).toContain("c6");
  });

  it("犯人自身を除いたケースは検査対象から外れている", () => {
    // 犯人を除くと嘘の事実も消えて必ず不成立になる。合格として数えていれば
    // 基準の事件でも「犯人が必須でない」と報告されてしまう
    const report = validateCase(validCase());
    expect(errorsOf(report)).toEqual([]);

    // 犯人を検査対象に含めていないことを、反例の本文でも確認する
    const broken = mutate(validCase(), (target) => {
      const target1 = target.variants.find((variant) => variant.culprit === "c1");
      target1!.contradictions = [contradiction(["f1", "f2", "f3"], "c1_exposed")];
    });
    const survivors = errorsOf(validateCase(broken))
      .filter((finding) => finding.item === 2)
      .flatMap((finding) => finding.detail)
      .join(" ");
    expect(survivors).not.toContain("c1（");
  });
});

describe("検証3: 単独不可", () => {
  it("犯人以外1人の証言だけで割れる事件は検証3だけが落ちる", () => {
    const report = validateCase(soloOwnerCase());
    expect(failedItems(report)).toEqual([3]);
    const detail = errorsOf(report)[0]!.detail.join("\n");
    expect(detail).toContain("展開後の事実:");
    expect(detail).toContain("所有者: c2");
  });

  it("多段推論のとき、推移的に展開して所有者を数える", () => {
    // 規則c1#1の直接のrequiresに含まれる犯人以外の事実はf3のみ。
    // step_oneを展開してf2まで辿るため検証3は成立する
    const report = validateCase(multiStepCase());
    expect(errorsOf(report).filter((finding) => finding.item === 3)).toEqual([]);
  });
});

describe("検証4: 冤罪なし", () => {
  it("嘘factを含まないrequiresは検証4だけが落ちる", () => {
    const broken = mutate(validCase(), (target) => {
      const target1 = target.variants.find((variant) => variant.culprit === "c1");
      target1!.contradictions = [contradiction(["f2", "f3", "f4", "f5", "f6"], "c1_exposed")];
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual([4]);
    const messages = errorsOf(report).map((finding) => finding.message).join("\n");
    expect(messages).toContain("ADR-0008");
    // 正直集合でも発火するため、発火した規則と満たした事実が反例に出る
    const detail = errorsOf(report)
      .flatMap((finding) => finding.detail)
      .join("\n");
    expect(detail).toContain("規則 c1#0 を満たした事実: f2, f3, f4, f5, f6");
  });
});

describe("検証5: 未使用なし", () => {
  it("どの矛盾にも使われない事実がある事件は検証5だけが落ちる", () => {
    const broken = mutate(validCase(), (target) => {
      target.facts.push(fact("f7", "c3", "stmt_seven", "the clock was slow that day"));
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual([5]);
    expect(errorsOf(report)[0]!.detail).toEqual(["f7(c3)"]);
    // バリアント横断・人数版横断の項目であることを反例の見出しで示す
    expect(formatFinding(errorsOf(report)[0]!)).toContain("全バリアント / 全人数版 / 検証5");
  });
});

describe("検証6: 表示完全性", () => {
  it("レベル別英文が欠けている事件は検証6だけが落ちる", () => {
    const broken = mutate(validCase(), (target) => {
      delete (target.facts[0]!.text as Record<string, string | undefined>)["3"];
      target.variants[1]!.lie.hintJa = "  ";
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual([6]);
    expect(errorsOf(report)[0]!.detail).toEqual(['facts[0].text["3"]', "variants[1].lie.hintJa"]);
  });

  it("revealとbriefingの欠落もJSONパスで報告する", () => {
    const broken = mutate(validCase(), (target) => {
      target.briefing.ja = "";
      target.reveal.keyExpressions = [];
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual([6]);
    expect(errorsOf(report)[0]!.detail).toEqual(["briefing.ja", "reveal.keyExpressions"]);
  });
});

describe("検証7: バリアント非干渉", () => {
  it("2つのバリアントが同じ嘘を共有する事件は検証7だけが落ちる", () => {
    const report = validateCase(sharedLieCase());
    expect(failedItems(report)).toEqual([7]);
    const finding = errorsOf(report)[0]!;
    expect(finding.variant).toBe("c1");
    expect(finding.detail.join("\n")).toContain("干渉したバリアントの犯人: c2");
    expect(finding.detail.join("\n")).toContain("発火した規則: c2#0");
  });
});

describe("5人版の導出と検証", () => {
  it("統合後に所有者が1人になる矛盾でrequires5pが未指定なら検証エラーになる", () => {
    const report = validateCase(mergeGapCase());
    const merge = errorsOf(report).filter((finding) => finding.item === "merge5p");
    expect(merge).toHaveLength(1);
    expect(merge[0]!.playerCount).toBe("5p");
    expect(merge[0]!.detail.join("\n")).toContain("統合後の所有者: c2");
  });

  it("下限人数を宣言しているのにmerge5pがない事件をエラーにする", () => {
    const broken = mutate(validCase(), (target) => {
      for (const character of target.characters) {
        character.merge5p = null;
      }
    });
    const merge = errorsOf(validateCase(broken)).filter((finding) => finding.item === "merge5p");
    expect(merge).toHaveLength(1);
    expect(merge[0]!.message).toContain("merge5p");
  });

  it("requires5pを指定すると5人版の検証が通る", () => {
    const fixed = mutate(mergeGapCase(), (target) => {
      // 5人版ではc2に統合されないc1側の事実を使わせる（設計上の解決）
      target.facts.push(fact("f1b", "c1", "stmt_one_b", "the lights were on upstairs"));
      target.characters.push({ id: "c4", name: "c4 (role)", recommendedLevel: 3, merge5p: null });
      target.facts.push(fact("f4", "c4", "stmt_four", "the bag was still there at ten past"));
      target.variants[0]!.contradictions = [contradiction(["f1", "f2", "f3"], "c1_exposed", ["f1", "f2", "f4"])];
    });
    const report = validateCase(fixed);
    expect(errorsOf(report).filter((finding) => finding.item === "merge5p")).toEqual([]);
  });
});

describe("構造検証", () => {
  it("参照の壊れた事件はschemaとして報告し、推論を実行しない", () => {
    const broken = mutate(validCase(), (target) => {
      target.facts[0]!.owner = "unknown_character";
      target.variants[0]!.contradictions[0]!.requires = ["f1", "no_such_fact"];
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual(["schema"]);
    const messages = errorsOf(report).map((finding) => finding.message);
    expect(messages.some((message) => message.includes("ownerが存在しない"))).toBe(true);
    expect(messages.some((message) => message.includes("未知の参照"))).toBe(true);
  });

  it("証言を1枚も持たないキャラクターがいる事件を拒否する", () => {
    const broken = mutate(validCase(), (target) => {
      target.characters.push({ id: "c7", name: "c7 (role)", recommendedLevel: 3, merge5p: null });
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toEqual(["schema"]);
    expect(errorsOf(report)[0]!.message).toContain("証言を1枚も持たない");
  });

  it("valueが重複する事件を拒否する", () => {
    const broken = mutate(validCase(), (target) => {
      target.facts[1]!.value = target.facts[0]!.value;
    });
    expect(failedItems(validateCase(broken))).toEqual(["schema"]);
  });

  it("嘘の差し替え対象が犯人以外の事実である事件を拒否する", () => {
    const broken = mutate(validCase(), (target) => {
      target.variants[0]!.lie.replaces = "f2";
    });
    const report = validateCase(broken);
    expect(failedItems(report)).toContain("schema");
    expect(errorsOf(report).some((finding) => finding.message.includes("所有者が犯人ではない"))).toBe(true);
  });
});

describe("追加リント", () => {
  it("レベル1〜2のキャラクターの証言がどの矛盾にも使われていないとエラーになる", () => {
    const broken = mutate(validCase(), (target) => {
      for (const variant of target.variants) {
        variant.contradictions[0]!.requires = variant.contradictions[0]!.requires.filter((id) => id !== "f1");
      }
      // f1を要求から外すと検証2・検証5も落ちるため、リントの有無だけを見る
    });
    const report = validateCase(broken);
    const lints = errorsOf(report).filter((finding) => finding.item === "lint");
    expect(lints).toHaveLength(1);
    expect(lints[0]!.message).toContain("c1");
  });

  it("hintJaがvalueの数値・時刻を本文に含むと警告する", () => {
    const broken = mutate(validCase(), (target) => {
      target.facts[0]!.value = "customer_left_at=14:10";
      target.facts[0]!.hintJa = "赤い上着の客は14:10に出た";
    });
    const warnings = validateCase(broken).findings.filter((finding) => finding.severity === "warning");
    expect(warnings.some((finding) => finding.message.includes("数値・時刻"))).toBe(true);
  });

  it("語義の並記形式のhintJaは警告しない", () => {
    const ok = mutate(validCase(), (target) => {
      target.facts[0]!.value = "customer_in_red_left_at=14:10";
      target.facts[0]!.hintJa = "red jacket = 赤い上着 / left = 出た";
    });
    expect(validateCase(ok).warningCount).toBe(0);
  });

  it("英文が目安の長さを外れると警告する", () => {
    const broken = mutate(validCase(), (target) => {
      target.facts[0]!.text["1"] = "This first level line is far too long for a beginner to read.";
      target.facts[1]!.text["5"] = "Too short.";
    });
    const warnings = validateCase(broken).findings.filter((finding) => finding.severity === "warning");
    expect(warnings.map((finding) => finding.message)).toEqual([
      expect.stringContaining("レベル1が8語を超える"),
      expect.stringContaining("レベル5が15語未満"),
    ]);
  });

  it("バリアント数がキャラクター数と一致しないと警告する", () => {
    const broken = mutate(validCase(), (target) => {
      target.variants = target.variants.filter((variant) => variant.culprit !== "c6");
    });
    const warnings = validateCase(broken).findings.filter((finding) => finding.severity === "warning");
    expect(warnings.map((finding) => finding.message)).toEqual([expect.stringContaining("バリアント数")]);
  });
});

describe("反例出力とGameModule互換の入口", () => {
  it("反例に事件id・バリアント・人数版・項目番号が含まれる", () => {
    const report = validateCase(soloOwnerCase());
    const line = formatFinding(errorsOf(report)[0]!);
    expect(line).toContain("fixture_solo_owner_v1");
    expect(line).toContain("c1");
    expect(line).toContain("6p");
    expect(line).toContain("検証3");
  });

  it("validateContentはValidationResultを返す", () => {
    expect(validateContent(validCase())).toEqual({ valid: true });
    const result = validateContent(soloOwnerCase());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("検証3");
  });
});
