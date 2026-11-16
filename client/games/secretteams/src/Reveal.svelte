<!--
  結果（基本設計/17の結果と画面）。

  勝敗と両チームの得点、チームごとのテーマとメンバーと単語、各自の回答と正誤を出す。
  他人の回答が自分を味方に選んでいたかを一覧で見られるようにする。誰に伝わり誰に伝わらなかったかの振り返りが、
  次の説明の工夫につながるためである（17の画面）。
  finishedのまま再接続した人へは共通コアが lastResult を再送するため、公開状態に依存しない。
  得点表は共通コアの ScoreBoard を使わない。ScoreBoard は1人1行の得点を受ける形であり、チームの得点を受けられない。
-->
<script lang="ts">
  import { faceColor, playerIconOf, sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { STAGES, type SecretTeamsResult, type TeamResult } from "@beb/shared-secretteams";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    result: SecretTeamsResult | null;
    onLeave: () => void;
  }
  let { room, result, onLeave }: Props = $props();

  const myId = $derived(ui.myPlayerId);
  const isHost = $derived(room.players.some((player) => player.id === myId && player.isHost));
  const winner = $derived(result?.teams.find((team) => team.theme.id === result?.winnerThemeId));
  const myTeam = $derived(result?.teams.find((team) => team.members.some((member) => member.playerId === myId)));
  // 自分を味方に選んだ人
  const pickedMe = $derived(
    result === null || myId === null
      ? []
      : result.answers.filter((record) => record.answer?.allyIds.includes(myId) ?? false).map((record) => record.playerId),
  );

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function teamOfPlayer(playerId: string): TeamResult | undefined {
    return result?.teams.find((team) => team.members.some((member) => member.playerId === playerId));
  }

  function themeLabel(themeId: string): string {
    if (result === null) {
      return themeId;
    }
    const index = result.themeChoices.findIndex((choice) => choice.id === themeId);
    const choice = result.themeChoices[index];
    return choice === undefined ? themeId : `${index + 1}. ${choice.en}`;
  }

  function percent(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }
</script>

<main class="reveal beb-stage-radial">
  <StageTimer deadline={undefined} label={stageLabels[STAGES.reveal]} />

  <div class="body">
    {#if result}
      <section class="headline" data-testid="winner">
        <p class="title beb-zoom-in">
          {result.outcome === "draw" ? "DRAW!" : `TEAM ${winner?.theme.en.toUpperCase() ?? ""} WINS!`}
        </p>
        {#if myTeam}
          <p class="mine-line">
            あなたのチームは <strong>{myTeam.theme.en}</strong>（{myTeam.theme.ja}）
          </p>
        {/if}
      </section>

      <section class="teams">
        <h2>チームの得点</h2>
        <ul>
          {#each result.teams as team (team.theme.id)}
            <li class:mine={team === myTeam} data-testid="team-result" data-theme-id={team.theme.id}>
              <div class="team-head">
                <span class="theme">{team.theme.en}<span class="ja">{team.theme.ja}</span></span>
                <span class="score" data-testid="team-score">{team.score}点</span>
              </div>
              <p class="rates">合流率 {percent(team.joinRate)} ／ 見抜き率 {percent(team.spotRate)}</p>
              <ul class="members">
                {#each team.members as member (member.playerId)}
                  <li data-testid="team-member" data-player-id={member.playerId}>
                    <span class="face" style={`background:${faceColor(member.playerId)}`} aria-hidden="true"
                      >{playerIconOf(member.playerId)}</span
                    >
                    <span class="name">{nameOf(member.playerId)}</span>
                    <span class="word">{member.word.en}<span class="ja">{member.word.ja}</span></span>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      </section>

      <section class="picked-me" data-testid="picked-me">
        <h2>あなたを味方に選んだ人</h2>
        {#if pickedMe.length === 0}
          <p class="none">いません</p>
        {:else}
          <p class="names">
            {#each pickedMe as playerId (playerId)}
              {@const ally = teamOfPlayer(playerId) === myTeam}
              <span class="chip" data-player-id={playerId}>
                {nameOf(playerId)}{ally ? "（味方）" : "（相手）"}
              </span>
            {/each}
          </p>
        {/if}
      </section>

      <section class="answers">
        <h2>各自の回答</h2>
        <ul>
          {#each result.answers as record (record.playerId)}
            {@const team = teamOfPlayer(record.playerId)}
            <li data-testid="answer-record" data-player-id={record.playerId}>
              <p class="who">
                <span class="face" style={`background:${faceColor(record.playerId)}`} aria-hidden="true"
                  >{playerIconOf(record.playerId)}</span
                >
                <span class="name">{nameOf(record.playerId)}</span>
                {#if team}<span class="team-tag">{team.theme.en}</span>{/if}
              </p>
              {#if record.answer === null}
                <p class="line none">回答なし</p>
              {:else}
                <p class="line">
                  味方:
                  {#each record.answer.allyIds as allyId (allyId)}
                    {@const correct = team?.members.some((member) => member.playerId === allyId) ?? false}
                    <span class="pick" class:correct>{correct ? "✓" : "×"} {nameOf(allyId)}</span>
                  {/each}
                </p>
                <p class="line">
                  相手のテーマ:
                  <span class="pick" class:correct={record.themeCorrect}>
                    {record.themeCorrect ? "✓" : "×"} {themeLabel(record.answer.opponentThemeId)}
                  </span>
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="waiting">結果を受け取っています…</p>
    {/if}

    {#if isHost}
      <button class="beb-btn yellow" onclick={() => sendCommon({ type: "nextGame" })} data-testid="back-to-lobby">
        <span>ロビーへ戻る</span>
      </button>
    {:else}
      <p class="waiting" data-testid="waiting-host">ホストがロビーへ戻します。</p>
    {/if}
    <button class="beb-btn ghost leave" onclick={onLeave} data-testid="leave-room"><span>部屋を出る</span></button>
  </div>
</main>

<style>
  .reveal {
    min-height: 100vh;
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .headline {
    text-align: center;
    margin: 0 0 1rem;
  }
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.8rem;
    color: var(--yellow);
    transform: skew(var(--skew-angle));
    overflow-wrap: anywhere;
  }
  .mine-line {
    margin: 0.4rem 0 0;
    font-size: 0.84rem;
  }
  section {
    margin: 0 0 0.9rem;
  }
  h2 {
    margin: 0 0 0.35rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .teams > ul > li,
  .answers li {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.6rem;
  }
  .teams > ul > li.mine {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .team-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .theme {
    font-size: 1.05rem;
    font-weight: 700;
  }
  .ja {
    margin-left: 0.35rem;
    font-size: 0.7rem;
    font-weight: 400;
    color: var(--mist);
  }
  .score {
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
  }
  .rates {
    margin: 0.2rem 0 0.35rem;
    font-size: 0.74rem;
    color: var(--mist);
  }
  .members {
    gap: 0.25rem;
  }
  .members li,
  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.84rem;
  }
  .who {
    margin: 0;
  }
  .face {
    flex: none;
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .word {
    margin-left: auto;
    font-weight: 700;
  }
  .team-tag {
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .line {
    margin: 0.2rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    font-size: 0.78rem;
  }
  .pick {
    color: var(--mist);
  }
  .pick.correct {
    color: var(--panel);
    font-weight: 700;
  }
  .none {
    margin: 0;
    font-size: 0.8rem;
    color: var(--mist);
  }
  .names {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.15rem 0.45rem;
    font-size: 0.8rem;
  }
  .waiting {
    margin: 0.6rem 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .leave {
    margin-top: 0.6rem;
  }
</style>
