/**
 * 日替わりミックスの組み立て（純関数）。API・IndexedDB・React には依存しない。
 * 同じ日・同じミックスIDなら、同じ入力から同じ並びになる（種は today + id）。
 * API 消費: ゼロ。
 */
import type { MusicTrack } from '../types/music';
import type { PlayLogRow } from './playLog';
import { isCountedPlay } from './playStats';
import { isBgmOrClassicalTrack } from './parser';

export interface DailyMix {
  id: string;
  title: string;
  subtitle: string;
  trackIds: string[];
}

export const DAILY_MIX_RECENT_ID = 'daily:recent';
export const DAILY_MIX_OLDIES_ID = 'daily:oldies';

/** ミックスIDごとの表示文言（保存するのは曲IDだけなので、文言はここから引く） */
export const DAILY_MIX_META: Record<string, { title: string; subtitle: string }> = {
  [DAILY_MIX_RECENT_ID]: { title: '最近よく聴いた曲の延長', subtitle: '最近のお気に入りから広げたミックス' },
  [DAILY_MIX_OLDIES_ID]: { title: 'ご無沙汰の名曲', subtitle: 'しばらく聴いていないお気に入り' },
};

export const DAILY_MIX_SIZE = 25;
export const DAILY_MIX_MIN = 8;
const MAX_PER_ARTIST = 2;
const RECENT_DAYS = 14;
const MIN_LOG_ROWS = 30;
const DAY_MS = 86_400_000;

/* ---------- 決定的な疑似乱数（自前） ---------- */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 日付まわり ---------- */

/** 'YYYY-MM-DD' → その日の正午(UTC)のms。日数差の計算専用 */
function dayMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1, 12);
}

function dateMinusDays(date: string, days: number): string {
  const d = new Date(dayMs(date) - days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** lastPlayed('YYYY-MM-DD HH:mm', UTC) → today からの経過日数。解釈できなければ null */
function daysSinceLastPlayed(lastPlayed: string, today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(lastPlayed || '');
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return Math.floor((dayMs(today) - ms) / DAY_MS);
}

/* ---------- 選び方 ---------- */

type Weighted = { track: MusicTrack; weight: number };

/** 重み付きで、同じアーティスト最大2曲・最大 limit 曲を選ぶ（種が同じなら同じ結果） */
function pickWeighted(cands: Weighted[], seedKey: string, limit: number, taken: Set<string>, artistCount: Map<string, number>): string[] {
  const rng = mulberry32(hashString(seedKey));
  const sorted = [...cands].sort((a, b) => (a.track.id < b.track.id ? -1 : a.track.id > b.track.id ? 1 : 0));
  // Efraimidis–Spirakis: key = u^(1/w) の大きい順 = 重み付き非復元抽出
  const keyed = sorted.map((c) => ({ c, key: Math.pow(rng(), 1 / Math.max(c.weight, 1e-6)) }));
  keyed.sort((a, b) => b.key - a.key);
  const out: string[] = [];
  for (const { c } of keyed) {
    if (out.length >= limit) break;
    const t = c.track;
    if (taken.has(t.id)) continue;
    const n = artistCount.get(t.artist) ?? 0;
    if (n >= MAX_PER_ARTIST) continue;
    taken.add(t.id);
    artistCount.set(t.artist, n + 1);
    out.push(t.id);
  }
  return out;
}

function filterEligible(tracks: MusicTrack[]): MusicTrack[] {
  const seen = new Set<string>();
  const base: MusicTrack[] = [];
  for (const t of tracks) {
    if (!t || !t.id || seen.has(t.id)) continue;
    if (t.isRadio) continue;
    if (isBgmOrClassicalTrack(t)) continue;
    seen.add(t.id);
    base.push(t);
  }
  // デモ曲は、デモ以外が十分にあるときだけ除外する
  const nonDemo = base.filter((t) => !t.isDemo);
  return nonDemo.length >= DAILY_MIX_MIN ? nonDemo : base;
}

function buildRecent(eligible: MusicTrack[], logRows: PlayLogRow[], today: string): string[] {
  const cutoff = dateMinusDays(today, RECENT_DAYS);
  const byId = new Map(eligible.map((t) => [t.id, t]));
  const recentRows = logRows.filter((r) => r.date >= cutoff && r.date <= today && isCountedPlay(r));

  const seedCount = new Map<string, number>(); // 種の曲ID → 重み(回数)
  const listened = new Set<string>(); // 直近14日に聴いた曲（候補から除く）
  if (recentRows.length >= MIN_LOG_ROWS) {
    for (const r of recentRows) {
      listened.add(r.trackId);
      if (byId.has(r.trackId)) seedCount.set(r.trackId, (seedCount.get(r.trackId) ?? 0) + 1);
    }
  } else {
    // ログが少ない: lastPlayed が直近14日の曲で代用
    for (const t of eligible) {
      const d = daysSinceLastPlayed(t.lastPlayed, today);
      if (d == null || d > RECENT_DAYS) continue;
      listened.add(t.id);
      seedCount.set(t.id, Math.max(1, t.playCount || 1));
    }
    for (const r of recentRows) listened.add(r.trackId);
  }

  const seeds = [...seedCount.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 8);
  if (seeds.length === 0) return [];

  const artistScore = new Map<string, number>();
  const genreScore = new Map<string, number>();
  for (const [id, n] of seeds) {
    const t = byId.get(id);
    if (!t) continue;
    artistScore.set(t.artist, (artistScore.get(t.artist) ?? 0) + n);
    if (t.genre) genreScore.set(t.genre, (genreScore.get(t.genre) ?? 0) + n);
  }

  const cands: Weighted[] = [];
  for (const t of eligible) {
    if (listened.has(t.id)) continue;
    const a = artistScore.get(t.artist) ?? 0;
    const g = t.genre ? genreScore.get(t.genre) ?? 0 : 0;
    if (a === 0 && g === 0) continue;
    cands.push({ track: t, weight: 1 + a * 2 + g });
  }
  return pickWeighted(cands, `${today}|${DAILY_MIX_RECENT_ID}`, DAILY_MIX_SIZE, new Set(), new Map());
}

function buildOldies(eligible: MusicTrack[], today: string): string[] {
  // 段階的にゆるめる: (3回以上・30日以上前) → (3回以上・14日以上前) → (2回以上・14日以上前)
  const stages = [
    { minCount: 3, minDays: 30 },
    { minCount: 3, minDays: 14 },
    { minCount: 2, minDays: 14 },
  ];
  const taken = new Set<string>();
  const artistCount = new Map<string, number>();
  const out: string[] = [];
  stages.forEach((s, i) => {
    if (out.length >= DAILY_MIX_SIZE) return;
    const cands: Weighted[] = [];
    for (const t of eligible) {
      if (taken.has(t.id) || (t.playCount || 0) < s.minCount) continue;
      const d = daysSinceLastPlayed(t.lastPlayed, today);
      if (d == null || d < s.minDays) continue;
      // 回数が多く、最終再生が古いほど出やすい
      cands.push({ track: t, weight: t.playCount * (1 + d / 30) });
    }
    out.push(...pickWeighted(cands, `${today}|${DAILY_MIX_OLDIES_ID}|${i}`, DAILY_MIX_SIZE - out.length, taken, artistCount));
  });
  return out;
}

export function buildDailyMixes(input: { tracks: MusicTrack[]; logRows: PlayLogRow[]; today: string }): DailyMix[] {
  const eligible = filterEligible(input.tracks);
  if (eligible.length < DAILY_MIX_MIN) return [];
  const raw: Array<[string, string[]]> = [
    [DAILY_MIX_RECENT_ID, buildRecent(eligible, input.logRows, input.today)],
    [DAILY_MIX_OLDIES_ID, buildOldies(eligible, input.today)],
  ];
  return raw
    .filter(([, ids]) => ids.length >= DAILY_MIX_MIN)
    .map(([id, trackIds]) => ({ id, ...DAILY_MIX_META[id], trackIds }));
}
