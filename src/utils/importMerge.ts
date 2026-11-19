import type { MusicTrack } from '../types/music';

/**
 * 履歴ファイルの取り込みを「いまのデータに追加（マージ）」にするための純関数。
 * React・IndexedDB には依存しない。API消費: 0ユニット。
 * 日付は 'YYYY-MM-DD HH:mm' 形式なので、文字列の辞書順で比較する（syncMerge.ts と同じ規則）。
 */

export interface ImportMergeResult {
  tracks: MusicTrack[];
  added: number;
  updated: number;
  unchanged: number;
}

const older = (a?: string, b?: string): string | undefined => {
  if (!a) return b || a;
  if (!b) return a;
  return a <= b ? a : b;
};
const newer = (a?: string, b?: string): string => {
  const x = a || '';
  const y = b || '';
  return x >= y ? x : y;
};
const hasDuration = (d: number | null | undefined): d is number => typeof d === 'number' && d > 0;

/** 取り込み側に同じ曲IDが複数あるとき、1つにまとめる（playCountは大きいほう、日付は同じ規則） */
function dedupeIncoming(incoming: MusicTrack[]): MusicTrack[] {
  const map = new Map<string, MusicTrack>();
  for (const t of incoming) {
    const p = map.get(t.id);
    if (!p) {
      map.set(t.id, t);
      continue;
    }
    map.set(t.id, {
      ...p,
      playCount: Math.max(p.playCount || 0, t.playCount || 0),
      firstPlayed: older(p.firstPlayed, t.firstPlayed),
      lastPlayed: newer(p.lastPlayed, t.lastPlayed),
      duration: hasDuration(p.duration) ? p.duration : hasDuration(t.duration) ? t.duration : p.duration,
      channelId: p.channelId || t.channelId,
      isFavorite: !!(p.isFavorite || t.isFavorite),
    });
  }
  return Array.from(map.values());
}

export function mergeImportedTracks(
  current: MusicTrack[],
  incoming: MusicTrack[],
  opts: { isDemo: boolean }
): ImportMergeResult {
  const inc = dedupeIncoming(incoming);

  // デモ／手元が0件のときは、取り込み分で置き換える
  if (opts.isDemo || current.length === 0) {
    return { tracks: inc, added: inc.length, updated: 0, unchanged: 0 };
  }

  const incMap = new Map<string, MusicTrack>();
  for (const t of inc) incMap.set(t.id, t);

  let updated = 0;
  let unchanged = 0;
  const seen = new Set<string>();
  const out: MusicTrack[] = new Array(current.length);

  for (let i = 0; i < current.length; i++) {
    const l = current[i];
    const r = incMap.get(l.id);
    if (!r) {
      out[i] = l;
      continue;
    }
    seen.add(l.id);
    const playCount = Math.max(l.playCount || 0, r.playCount || 0);
    const firstPlayed = older(l.firstPlayed, r.firstPlayed);
    const lastPlayed = newer(l.lastPlayed, r.lastPlayed);
    const duration = hasDuration(l.duration) ? l.duration : hasDuration(r.duration) ? r.duration : l.duration;
    const channelId = l.channelId ? l.channelId : r.channelId || l.channelId;

    const changed =
      playCount !== l.playCount ||
      firstPlayed !== l.firstPlayed ||
      lastPlayed !== l.lastPlayed ||
      duration !== l.duration ||
      channelId !== l.channelId;

    if (changed) {
      updated++;
      out[i] = { ...l, playCount, firstPlayed, lastPlayed, duration, channelId };
    } else {
      unchanged++;
      out[i] = l; // 同じ参照を保つ（保存処理が「変わった曲だけ」を判定できるように）
    }
  }

  // 手元にない曲は末尾に追加（取り込み側の値をそのまま使う）
  let added = 0;
  for (const t of inc) {
    if (seen.has(t.id)) continue;
    out.push(t);
    added++;
  }
  return { tracks: out, added, updated, unchanged };
}

