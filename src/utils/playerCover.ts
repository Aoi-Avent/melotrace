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
const listeners = new Set<() => void>();

/** onStateChange から呼ぶ。同じ状態なら何もしない */
export function publishPlayerState(state: number) {
  let changed = false;
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
  if (changed) listeners.forEach((l) => l());
}

/**
 * 画面を覆う（サムネ＋暗幕で、YouTube側のUIを隠す）べきか。
 * - UIが「再生中」でも、実際が 未開始/頭出し/終了 なら覆う（YouTube側の再生ボタン・終了画面を見せない）
 * - 読み込み中(3)は、その曲がまだ一度も再生されていないときだけ覆う（途中のバッファリングでは覆わない）
 * - 広告中は、広告のUI（スキップ等）を押せるよう、決して覆わない
 */
export function shouldCover(isPlaying: boolean, isAdPlaying: boolean, state: number, started: boolean): boolean {
  if (isAdPlaying) return false;
  if (!isPlaying) return true;
  if (state === -1 || state === 5 || state === 0) return true;
  if (state === 3 && !started) return true;
  return false;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 実際のプレーヤー状態と「一度でも再生されたか」を、1つの数値に畳んで購読する（state*2 + started） */
export function usePlayerCoverInput(): { state: number; started: boolean } {
  const packed = useSyncExternalStore(
    subscribe,
    () => realState * 2 + (startedOnce ? 1 : 0),
    () => -2
  );
  return { state: Math.floor(packed / 2), started: packed % 2 === 1 };
}
