// 4本の台本。数値はすべて各ゲームのshared定数を出典とし、ここでは写しを持つ。
//
// 写しを持つ理由は、動画が「収録時点の仕様」を映すものであり、定数を変えたときに
// 動画が自動で追従してはまずいからである（古い動画と新しいアプリの食い違いに気づけない）。
// 定数を変えたらこのファイルも同じPRで直す（docs/ムービー.md）。
//
// 文字はすべて行の配列で書く。自動折り返しに任せると助詞の途中で行が落ちるため、
// 改行位置は意味の区切り（読点・文の終わり・主語と述語の境目）に置く。
// 1行は全角16文字を目安とし、超える行は表示側が自動で縮める（shared/parts.tsx の fitWithin）。
//
// 部屋に入ってロビーで集まるまでの導線は4本とも同じであり、各動画には入れない。
// 撮った素材（common-home / common-lobby）は残してあるが本編では使わない（docs/ムービー.md）。
import type { Lines } from "./parts";
import type { GameId } from "./theme";

export interface Beat {
  /** 使う素材。capture/shots.spec.ts の名前と同じ */
  shot: string;
  /** 画面上部に出すステージ名。実画面のタイマーバーと同じ語 */
  stage?: string;
  /** 1枚に1つだけ置く主張 */
  caption: Lines;
  /** この画で止める秒数 */
  hold: number;
}

export interface MovieScript {
  id: GameId;
  icon: string;
  title: Lines;
  tagline: Lines;
  /** 目的。タイトル札の次に1枚だけ置く */
  purpose: Lines;
  beats: Beat[];
  /** 締めに出す得点の説明 */
  scoring: Lines[];
  /** 締めに出す約束。守らないとゲームが成立しないものだけ */
  promises: Lines[];
}

/** gameIdから台本を引く。シーンファイルはこれだけを使う */
export function scriptOf(id: GameId): MovieScript {
  const found = SCRIPTS.find((script) => script.id === id);
  if (found === undefined) {
    throw new Error(`台本がない: ${id}`);
  }
  return found;
}

export const SCRIPTS: MovieScript[] = [
  {
    id: "detectives",
    icon: "🔍",
    title: ["ENGLISH", "DETECTIVES"],
    tagline: ["英語で聞き込み、", "嘘つきを1人あぶり出す"],
    purpose: ["全員が事件の関係者", "1人だけが犯人で、その証言には", "嘘が1枚混ざっている"],
    beats: [
      {
        shot: "detectives-briefing",
        stage: "ブリーフィング",
        caption: ["事件の概要は", "全員に同じものが出る"],
        hold: 3.0,
      },
      {
        shot: "detectives-role-cover",
        stage: "ブリーフィング",
        caption: ["役柄は伏せ面のまま届く", "まわりを確認してから開く"],
        hold: 3.2,
      },
      {
        shot: "detectives-role-card",
        stage: "ブリーフィング",
        caption: ["犯人は赤、市民は青", "自分だけが知る"],
        hold: 3.0,
      },
      {
        shot: "detectives-investigation",
        stage: "捜査（既定10分）",
        caption: ["手元の証言カードを英語で", "読み上げて聞き込む"],
        hold: 3.4,
      },
      {
        shot: "detectives-investigation-level1",
        stage: "捜査",
        caption: ["レベル1〜2には質問の型が付く", "単語とYes / Noで戦える"],
        hold: 3.4,
      },
      {
        shot: "detectives-voting",
        stage: "投票（90秒）",
        caption: ["犯人だと思う1人へ投票する", "1回きりで変えられない"],
        hold: 3.2,
      },
      {
        shot: "detectives-reveal",
        stage: "開示",
        caption: ["犯人・嘘の証言・矛盾・真相が出る"],
        hold: 3.2,
      },
    ],
    scoring: [["最多票が犯人と一致すれば", "市民の勝ち"], ["票が割れるか同数なら犯人の勝ち"]],
    promises: [
      ["自分のカードは他人に見せない"],
      ["証言は英語で読み上げる"],
      ["「聞かれたときだけ」のカードは", "自分から話さない"],
    ],
  },
  {
    id: "dontsayit",
    icon: "🤐",
    title: ["DON'T", "SAY IT"],
    tagline: ["禁止語を避けて、", "英語でお題を説明する"],
    purpose: ["説明者が英語でお題を説明し、", "まわりが言い当てる", "使えない語が配られている"],
    beats: [
      {
        shot: "dontsayit-briefing",
        stage: "ルール確認",
        caption: ["説明者・監視役・回答者の3役を", "全員が順に回る"],
        hold: 3.2,
      },
      {
        shot: "dontsayit-handoff-cover",
        stage: "交代（30秒）",
        caption: ["お題は説明者だけに伏せ面で届く"],
        hold: 2.8,
      },
      {
        shot: "dontsayit-handoff-card",
        stage: "交代",
        caption: ["お題の名前と、使ってはいけない語"],
        hold: 3.0,
      },
      {
        shot: "dontsayit-explaining-speaker",
        stage: "説明タイム（既定90秒）",
        caption: ["説明者の画面", "禁止語は形を変えても言えない"],
        hold: 3.4,
      },
      {
        shot: "dontsayit-explaining-watcher",
        stage: "説明タイム",
        caption: ["監視役は正解と禁止語を見て", "違反だけを押す"],
        hold: 3.2,
      },
      {
        shot: "dontsayit-explaining-answerer",
        stage: "説明タイム",
        caption: ["回答者の手元には何も出ない", "顔を上げて声を聞く"],
        hold: 3.2,
      },
      {
        shot: "dontsayit-claim-sheet",
        stage: "説明タイム",
        caption: ["当たったら説明者が「正解」を押し", "誰が当てたかを選ぶ"],
        hold: 3.2,
      },
    ],
    scoring: [
      ["成立すると説明者と", "当てた人に各1点"],
      ["禁止語を使うと説明者は1点減る"],
      ["スキップは1ラウンド1回だけ", "減点はない"],
    ],
    promises: [
      ["自分の画面を他人に見せない"],
      ["禁止語は複数形・過去形にしても", "同じ語とみなす", "お題の別名も言えない"],
      ["レベルで使えない語が増える", "3・3・5・7・10語", "レベル5だけ話し方の条件も付く"],
    ],
  },
  {
    id: "ranking",
    icon: "🏆",
    title: ["ENGLISH", "RANKING"],
    tagline: ["秘密の目標を抱えて、", "英語で順位を決める"],
    purpose: ["5つの項目を英語で話し合って", "1位から5位に並べる", "各自に秘密の目標がある"],
    beats: [
      {
        shot: "ranking-goal-cover",
        stage: "目標の確認（90秒）",
        caption: ["目標は伏せ面で届く", "割れると駆け引きが成立しない"],
        hold: 3.0,
      },
      {
        shot: "ranking-goal-card",
        stage: "目標の確認",
        caption: ["自分だけの目標と", "主張に使える英文の例"],
        hold: 3.2,
      },
      {
        shot: "ranking-discussion",
        stage: "議論（既定120秒）",
        caption: ["英語で順位を話し合う", "目標を日本語で言わない"],
        hold: 3.4,
      },
      {
        shot: "ranking-confirming",
        stage: "順位の確定（90秒）",
        caption: ["ホストが卓の合意した順位を並べる"],
        hold: 3.2,
      },
      {
        shot: "ranking-approve",
        stage: "順位の確定",
        caption: ["全員が承認して確定", "違うと思ったら承認せず口で言う"],
        hold: 3.2,
      },
      {
        shot: "ranking-reveal",
        stage: "開示",
        caption: ["確定順位と、", "全員の目標の達成が出る"],
        hold: 3.2,
      },
    ],
    scoring: [
      ["目標が通れば2点", "通らなければ0点で、減点はない"],
      ["3ラウンドの合計で競う（0〜6点）"],
      ["同じラウンドで何人達成してもよい"],
    ],
    promises: [
      ["自分の画面を他人に見せない"],
      ["議論は英語で行う"],
      ["目標の難しさは", "英語レベルの高い人ほど上がる"],
    ],
  },
  {
    id: "whowrotethis",
    icon: "✍️",
    title: ["WHO WROTE", "THIS?"],
    tagline: ["英語で書いた1文を並べ、", "誰が書いたか当てる"],
    purpose: ["全員が同じ質問に英語で1文答える", "名前を伏せて1件ずつ出し、", "作者を当てる"],
    beats: [
      {
        shot: "whowrotethis-briefing",
        stage: "質問の確認（60秒）",
        caption: ["質問は全員に同じ", "言い方の例は自分だけに届く"],
        hold: 3.2,
      },
      {
        shot: "whowrotethis-briefing-level1",
        stage: "質問の確認",
        caption: ["レベル1〜2には例が3件", "「...」を自分の言葉に置き換える"],
        hold: 3.4,
      },
      {
        shot: "whowrotethis-writing-tooshort",
        stage: "英作文（既定90秒）",
        caption: ["4語以上・140文字まで", "足りないと出せない"],
        hold: 3.2,
      },
      {
        shot: "whowrotethis-writing-ready",
        stage: "英作文",
        caption: ["締切までは何度でも書き直せる"],
        hold: 3.0,
      },
      {
        shot: "whowrotethis-guessing",
        stage: "作者当て（1件40秒）",
        caption: ["1件ずつ名前を伏せて出る", "誰が書いたか英語で言い合う"],
        hold: 3.4,
      },
      {
        shot: "whowrotethis-guessing-author",
        stage: "作者当て",
        caption: ["自分の文が出ているときは", "指名できない"],
        hold: 3.0,
      },
      {
        shot: "whowrotethis-judging",
        stage: "答え合わせ（12秒）",
        caption: ["作者と、", "誰が誰を指名したかが出る"],
        hold: 3.2,
      },
    ],
    scoring: [
      ["指名が当たれば1点", "外しても減点はない"],
      ["自分の文を誰にも", "当てられなければ1点"],
      ["2ラウンドの合計で競う", "（6人なら最大12点）"],
    ],
    promises: [
      ["自分の画面を他人に見せない"],
      ["「これは自分の文だ」と", "口で言わない"],
      ["自分らしくない書き方をすると", "隠れやすい"],
    ],
  },
];
