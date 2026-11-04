import { useSyncExternalStore } from 'react';

/**
 * 埋め込みプレーヤーの「実際の状態」を、見た目の層（VideoOverlay）へ伝える小さな置き場。
 * 状態の値は公式IFrame APIの onStateChange が返すもの
 * （-1:未開始 0:終了 1:再生中 2:一時停止 3:読み込み中 5:頭出し）。
 * API消費: なし（IFrame APIのイベントを受け取るだけ。YouTube Data APIは呼ばない）。
 */
let realState = -1;
/** 現在の曲で、一度でも「再生中(1)」になったか。読み込み中(3)の扱いを分けるために使う */
let startedOnce = false;
/** シーク直後の「読み込み直し」で、YouTube側のUIが一瞬出るのを覆うための印 */
let seeking = false;
let seekTimer: ReturnType<typeof setTimeout> | undefined;
let sawBufferingSinceSeek = false;
const SEEK_COVER_MAX_MS = 2000; // 状態1に戻らなくても、この時間で必ず外す
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** シークしたときに呼ぶ（seekTo の中から1行）。再生中のときだけ、短く覆う */
export function markSeek() {
  seeking = true;
  sawBufferingSinceSeek = false;
  clearTimeout(seekTimer);
  seekTimer = setTimeout(() => {
    seeking = false;
    notify();
  }, SEEK_COVER_MAX_MS);
  notify();
}

/** onStateChange から呼ぶ。同じ状態なら何もしない */
export function publishPlayerState(state: number) {
  let changed = false;
  if (seeking) {
    if (state === 3) sawBufferingSinceSeek = true;
    else if (state === 1 && sawBufferingSinceSeek) {
      // 読み込み直しが終わって再生に戻った: 覆いを外す
      seeking = false;
      clearTimeout(seekTimer);
      changed = true;
    }
  }
  if (state === 1 && !startedOnce) {
    startedOnce = true;
    changed = true;
  } else if ((state === -1 || state === 5 || state === 0) && startedOnce) {
    // 新しい読み込みの始まり、または終了: 次の読み込み中(3)は「まだ始まっていない」扱いに戻す
    startedOnce = false;
    changed = true;
  }
  if (state !== realState) {
    realState = state;
    changed = true;
  }
  if (changed) notify();
}

/**
 * サムネ＋暗幕で、YouTube側のUIを覆うべきか。
 * - 一時停止中は覆わない（止まった動画をそのまま見せる）
 * - UIが「再生中」でも、実際が 未開始/頭出し/終了 なら覆う（YouTube側の再生ボタン・終了画面を見せない）
 * - 読み込み中(3)は、その曲がまだ一度も再生されていないとき、またはシーク直後だけ覆う
 * - 広告中は、広告のUI（スキップ等）を押せるよう、決して覆わない
 */
export function shouldCover(isPlaying: boolean, isAdPlaying: boolean, state: number, started: boolean, seekingNow: boolean): boolean {
  if (isAdPlaying || !isPlaying) return false;
  if (state === -1 || state === 5 || state === 0) return true;
  if (state === 3 && (!started || seekingNow)) return true;
  if (seekingNow) return true;
  return false;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 実際のプレーヤー状態・「一度でも再生されたか」・シーク直後かを、1つの数値に畳んで購読する */
export function usePlayerCoverInput(): { state: number; started: boolean; seeking: boolean } {
  const packed = useSyncExternalStore(
    subscribe,
    () => (realState + 1) * 4 + (seeking ? 2 : 0) + (startedOnce ? 1 : 0),
    () => 0
  );
  return { state: Math.floor(packed / 4) - 1, seeking: (packed & 2) !== 0, started: (packed & 1) !== 0 };
}
