/**
 * 年間まとめの集計（純関数）。React・IndexedDB には依存しない。YouTube API 消費 0。
 * 再生は再生ログの行で数える（isCountedPlay のみ）。ランキングはライブラリにある曲だけ。
 */
import type { PlayLogRow } from './playLog';
import { isCountedPlay } from './playStats';
import type { MusicTrack } from '../types/music';

export const DEFAULT_TRACK_SEC = 210;

export interface RankedTrack {
  track: MusicTrack;
  count: number;
}
export interface RankedArtist {
  artist: string;
  count: number;
}
export interface DatedTrack {
  track: MusicTrack;
  /** ローカルの 'YYYY-MM-DD' */
  date: string;
}

export interface YearReview {
  year: number;
  /** その年の再生ログ行が1件でもあるか */
  hasLog: boolean;
  /** 数えた再生（isCountedPlay のみ） */
  totalPlays: number;
  /** 推定の総再生時間（秒） */
  totalSec: number;
  topTracks: RankedTrack[];
  topArtists: RankedArtist[];
  /** ライブラリにない曲の再生回数（合計には入るがランキングには出ない） */
  unrankedPlays: number;
  /** 1〜12月の再生回数（index 0 = 1月） */
  months: number[];
  /** 一番多い月（1〜12）。再生が0なら null */
  peakMonth: number | null;
  /** その年のログの最初の日付（'YYYY-MM-DD'）。ログなしは null */
  logStartDate: string | null;
  firstHeardCount: number;
  firstHeardEarliest: DatedTrack[];
  /** ログがない年のみ: 最後に聴いたのがその年の曲（playCount 順の上位5） */
  lastHeardTop: DatedTrack[];
  /** 出せる項目が何もない */
  isEmpty: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm'（UTC）→ ローカルの Date。壊れた値は null */
export function utcStringToLocalDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const v = s.trim();
  const t = Date.parse(v.replace(' ', 'T') + (v.length <= 10 ? 'T00:00:00Z' : ':00Z'));
  return Number.isNaN(t) ? null : new Date(t);
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 曲の firstPlayed / lastPlayed に現れる年（ローカル） */
export function collectTrackYears(tracks: MusicTrack[]): number[] {
  const set = new Set<number>();
  for (const t of tracks) {
    const a = utcStringToLocalDate(t.firstPlayed);
    const b = utcStringToLocalDate(t.lastPlayed);
    if (a) set.add(a.getFullYear());
    if (b) set.add(b.getFullYear());
  }
  return [...set];
}

function topN<K>(map: Map<K, number>, n: number): [K, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function buildYearReview({ year, logRows, tracks }: { year: number; logRows: PlayLogRow[]; tracks: MusicTrack[] }): YearReview {
  const byId = new Map<string, MusicTrack>();
  for (const t of tracks) byId.set(t.id, t);

  const prefix = `${year}-`;
  const rows = logRows.filter((r) => typeof r.date === 'string' && r.date.startsWith(prefix));
  const hasLog = rows.length > 0;

  const months = new Array<number>(12).fill(0);
  const trackCount = new Map<string, number>();
  const artistCount = new Map<string, number>();
  let totalPlays = 0;
  let totalSec = 0;
  let unrankedPlays = 0;
  let logStartDate: string | null = null;

  for (const r of rows) {
    if (logStartDate == null || r.date < logStartDate) logStartDate = r.date;
    if (!isCountedPlay(r)) continue;
    totalPlays++;
    const t = byId.get(r.trackId);
    const dur = t && typeof t.duration === 'number' && t.duration > 0 ? t.duration : DEFAULT_TRACK_SEC;
    totalSec += r.sec != null ? r.sec : dur;
    const m = Number(r.date.slice(5, 7));
    if (m >= 1 && m <= 12) months[m - 1]++;
    if (t) {
      trackCount.set(t.id, (trackCount.get(t.id) || 0) + 1);
      artistCount.set(t.artist, (artistCount.get(t.artist) || 0) + 1);
    } else {
      unrankedPlays++;
    }
  }

  const topTracks: RankedTrack[] = topN(trackCount, 5).map(([id, count]) => ({ track: byId.get(id)!, count }));
  const topArtists: RankedArtist[] = topN(artistCount, 5).map(([artist, count]) => ({ artist, count }));

  let peakMonth: number | null = null;
  let peak = 0;
  months.forEach((c, i) => {
    if (c > peak) {
      peak = c;
      peakMonth = i + 1;
    }
  });

  // (e) その年に初めて聴いた曲（firstPlayed はログの有無に関係なく使う）
  const first: DatedTrack[] = [];
  const last: DatedTrack[] = [];
  for (const t of tracks) {
    const f = utcStringToLocalDate(t.firstPlayed);
    if (f && f.getFullYear() === year) first.push({ track: t, date: localDateStr(f) });
    if (!hasLog) {
      const l = utcStringToLocalDate(t.lastPlayed);
      if (l && l.getFullYear() === year) last.push({ track: t, date: localDateStr(l) });
    }
  }
  first.sort((a, b) => a.date.localeCompare(b.date));
  last.sort((a, b) => b.track.playCount - a.track.playCount);

  return {
    year,
    hasLog,
    totalPlays,
    totalSec,
    topTracks,
    topArtists,
    unrankedPlays,
    months,
    peakMonth,
    logStartDate,
    firstHeardCount: first.length,
    firstHeardEarliest: first.slice(0, 3),
    lastHeardTop: last.slice(0, 5),
    isEmpty: !hasLog && first.length === 0 && last.length === 0,
  };
}
