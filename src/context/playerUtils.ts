import { MusicTrack } from '../types/music';
import { SyncBase } from '../utils/syncMerge';
import { SYNC_BASE_KEY } from './playerConstants';

/** 再生できないと分かっている曲を飛ばして、次（または前）の曲の位置を選ぶ */
export function pickPlayableIndex(queue: MusicTrack[], from: number, dir: 1 | -1, shuffle: boolean, bad: Set<string>): number {
  const n = queue.length;
  for (let tries = 0; tries < Math.min(n, 30); tries++) {
    const idx = shuffle && dir === 1 ? Math.floor(Math.random() * n) : (((from + dir * (tries + 1)) % n) + n) % n;
    if (!bad.has(queue[idx].id)) return idx;
  }
  return (((from + dir) % n) + n) % n;
}

export const nowIso = () => new Date().toISOString();
export const nowLabel = () =>
  new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export const readBase = (): SyncBase | null => {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC_BASE_KEY) || 'null');
    if (v && typeof v.hash === 'string' && typeof v.rev === 'string') return v;
  } catch (e) {}
  return null;
};
export const writeBase = (hash: string, rev: string) => {
  try {
    localStorage.setItem(SYNC_BASE_KEY, JSON.stringify({ hash, rev }));
  } catch (e) {}
};
