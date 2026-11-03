/**
 * 再生ログの集計ルール。集計で「再生」を数えるときは必ず isCountedPlay を通す。
 * API 消費なし（YouTube API は使わない）。
 */
import type { PlayLogRow } from './playLog';

/** この秒数未満しか聴いていない再生は、回数に数えない */
export const MIN_COUNTED_SEC = 30;

/** sec が未設定（計測前・再生中）、または30秒以上なら true */
export function isCountedPlay(row: Pick<PlayLogRow, 'sec'>): boolean {
  return row.sec == null || row.sec >= MIN_COUNTED_SEC;
}
