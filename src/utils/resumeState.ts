import type { MusicTrack } from '../types/music';

/**
 * 「前回最後に聴いていた曲・位置・キュー」を端末内に保存・復元する（API消費: 0ユニット。localStorageのみ）。
 * 自動再生はしない。壊れたデータ・削除済みの曲などは、すべて null を返して従来の初期状態に戻す。
 */
export const STORAGE_KEY_RESUME = 'melotrace_resume_v1';
const UNPLAYABLE_KEY = 'melotrace_unplayable_v1'; // PlayerContext の unplayableRef と同じキー（読み取りのみ）
const MAX_QUEUE_IDS = 100;
const MAX_SNAPSHOTS = 30;
const END_GUARD_SEC = 5;

/** ライブラリにない曲の最小スナップショット */
export interface TrackSnapshot {
  id: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number | null;
}

interface ResumeData {
  v: 1;
  trackId: string;
  seconds: number;
  savedAt: number;
  queueIds: string[];
  snapshots: TrackSnapshot[];
}

export interface ResumeRestore {
  track: MusicTrack;
  queue: MusicTrack[];
  index: number;
  seconds: number;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** 保存する。ラジオ曲が再生中のときは何もしない（ラジオは復元しない） */
export function saveResume(args: {
  track: MusicTrack | null;
  seconds: number;
  queue: MusicTrack[];
  libraryIds: Set<string>;
}): void {
  try {
    const { track, queue, libraryIds } = args;
    if (!track || track.isRadio) return;
    const q = queue.filter((t) => !t.isRadio).slice(0, MAX_QUEUE_IDS);
    // いまの曲が先頭100件の外でも、復元できるよう必ず含める
    const ids = q.map((t) => t.id);
    if (!ids.includes(track.id)) ids.unshift(track.id);
    const byId = new Map<string, MusicTrack>(q.map((t) => [t.id, t]));
    byId.set(track.id, byId.get(track.id) ?? track);
    // 起動直後はライブラリの一部（先頭300曲）しか読めていないので、ライブラリの曲かどうかに関係なく、
    // いまの曲の前後30件はスナップショットを持つ。復元時はライブラリにあればそちらを優先する。
    // （libraryIds は将来の使い分け用に受け取るだけで、保存の可否には使わない）
    const ci = Math.max(0, ids.indexOf(track.id));
    const start = Math.max(0, ci - 5);
    const snapshots: TrackSnapshot[] = [];
    for (const id of ids.slice(start, start + MAX_SNAPSHOTS)) {
      const t = byId.get(id);
      if (!t) continue;
      snapshots.push({ id: t.id, title: t.title, artist: t.artist, thumbnailUrl: t.thumbnailUrl, duration: t.duration ?? null });
    }
    const secs = Number.isFinite(args.seconds) && args.seconds > 0 ? Math.floor(args.seconds) : 0;
    const data: ResumeData = { v: 1, trackId: track.id, seconds: secs, savedAt: Date.now(), queueIds: ids.slice(0, MAX_QUEUE_IDS), snapshots };
    localStorage.setItem(STORAGE_KEY_RESUME, JSON.stringify(data));
  } catch (e) {
    // 保存失敗は無視（容量超過など）
  }
}

function readResume(): ResumeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESUME);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !isStr(d.trackId) || !Array.isArray(d.queueIds)) return null;
    return {
      v: 1,
      trackId: d.trackId,
      seconds: typeof d.seconds === 'number' && Number.isFinite(d.seconds) && d.seconds > 0 ? d.seconds : 0,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
      queueIds: d.queueIds.filter(isStr).slice(0, MAX_QUEUE_IDS),
      snapshots: Array.isArray(d.snapshots)
        ? d.snapshots
            .filter((s: any) => s && isStr(s.id) && isStr(s.title) && typeof s.artist === 'string')
            .slice(0, MAX_SNAPSHOTS)
            .map((s: any) => ({
              id: s.id,
              title: s.title,
              artist: s.artist,
              thumbnailUrl: typeof s.thumbnailUrl === 'string' ? s.thumbnailUrl : '',
              duration: typeof s.duration === 'number' && s.duration > 0 ? s.duration : null,
            }))
        : [],
    };
  } catch (e) {
    return null;
  }
}

function readUnplayable(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(UNPLAYABLE_KEY) || '[]');
    return new Set<string>(Array.isArray(v) ? v.filter(isStr) : []);
  } catch (e) {
    return new Set<string>();
  }
}

/** 残りが5秒以内なら0秒から。長さが不明なら保存秒をそのまま使う */
export function normalizeResumeSeconds(seconds: number, duration?: number | null): number {
  if (!Number.isFinite(seconds) || seconds < 1) return 0;
  if (duration && duration > 0 && duration - seconds <= END_GUARD_SEC) return 0;
  return seconds;
}

/**
 * 保存データから「曲・キュー・キュー内の位置・秒」を組み立てる。
 * 前回の曲が使えない（削除済み・禁止・再生不能・壊れたデータ）ときは null（＝従来どおり先頭の曲）。
 * 復元した曲はライブラリには追加しない。
 */
export function restoreResume(args: {
  tracks: MusicTrack[];
  bannedTracks: string[];
  bannedArtists: string[];
}): ResumeRestore | null {
  try {
    const d = readResume();
    if (!d) return null;
    const unplayable = readUnplayable();
    const lib = new Map(args.tracks.map((t) => [t.id, t]));
    const snaps = new Map(d.snapshots.map((s) => [s.id, s]));
    const ok = (t: MusicTrack) => !t.isRadio && !args.bannedTracks.includes(t.id) && !args.bannedArtists.includes(t.artist) && !unplayable.has(t.id);
    const resolve = (id: string): MusicTrack | null => {
      const l = lib.get(id);
      if (l) return ok(l) ? l : null;
      const s = snaps.get(id);
      if (!s) return null; // ライブラリにもスナップショットにもない曲は飛ばす
      const t: MusicTrack = {
        id: s.id, title: s.title, artist: s.artist, genre: '', playCount: 0, duration: s.duration,
        lastPlayed: '', isFavorite: false, thumbnailUrl: s.thumbnailUrl,
      };
      return ok(t) ? t : null;
    };
    const track = resolve(d.trackId);
    if (!track) return null;
    const seen = new Set<string>();
    const queue: MusicTrack[] = [];
    for (const id of d.queueIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const t = resolve(id);
      if (t) queue.push(t);
    }
    let index = queue.findIndex((t) => t.id === track.id);
    if (index < 0) {
      queue.unshift(track);
      index = 0;
    }
    return { track, queue, index, seconds: normalizeResumeSeconds(d.seconds, track.duration) };
  } catch (e) {
    return null;
  }
}
