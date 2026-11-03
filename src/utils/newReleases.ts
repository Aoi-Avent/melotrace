// お気に入りのアーティストの新曲（ホームの「新着」棚）。
//
// API消費の見積もり（公式 YouTube Data API v3 の list 系は1回1ユニット）:
//   アーティスト1人あたり playlistItems.list を1回（1ユニット）＋ 新しい動画をまとめて videos.list（50件で1ユニット）。
//   20人で1回あたり約25〜30ユニット（20 + 動画の取得 数ユニット）、更新は6時間に1回までなので1日最大4回。
//   1日10,000ユニットを全員で共有するため、1回の更新は最大30アーティスト・同時実行3、QUOTA_EXCEEDED / KEY_REJECTED で即中止。
//   search.list は使わない。手動更新ボタンもない（ホームを開いたときだけ、期限切れの分を取得する）。
//
// 更新の単位はアーティスト（チャンネル）ごと。6時間以内に取得済みのチャンネルは、開き直してもAPIを呼ばない。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MusicTrack } from '../types/music';
import { extractSmartTrackMeta, classifyMusicGenre, isLikelyMusic } from './parser';
import { YoutubeApiError, getPlaylistVideos, getVideos, type YtVideo } from './youtubeApi';
import { uploadsPlaylistIdOf } from './youtubeUrl';

export interface NewReleaseTarget {
  channelId: string;
  name: string;
}
export type NewReleaseTrack = MusicTrack & { publishedAt: string };
type Strictness = 'strict' | 'standard' | 'all';
type FatalCode = 'NO_KEY' | 'KEY_REJECTED' | 'QUOTA_EXCEEDED';

const CACHE_KEY = 'melotrace_new_releases_v1';
export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FAIL_BACKOFF_MS = 60 * 60 * 1000; // 致命的なエラーのあとは、1時間は取りにいかない
const MAX_ARTISTS_PER_REFRESH = 30;
const CONCURRENCY = 3;
const MAX_PLAYLIST_ITEMS = 10;
const WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const MIN_SEC = 60;
const MAX_SEC = 20 * 60;
const SHELF_MAX = 20;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

interface ChannelEntry {
  at: number;
  items: NewReleaseTrack[];
}
interface Cache {
  byChannel: Record<string, ChannelEntry>;
  failedAt?: number;
  failError?: FatalCode;
}

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { byChannel: {} };
    const d = JSON.parse(raw);
    if (!d || typeof d.byChannel !== 'object' || d.byChannel === null) return { byChannel: {} };
    return d as Cache;
  } catch {
    return { byChannel: {} };
  }
}

function saveCache(c: Cache): void {
  const now = Date.now();
  const byChannel: Record<string, ChannelEntry> = {};
  for (const [k, v] of Object.entries(c.byChannel)) if (now - v.at < KEEP_MS) byChannel[k] = v;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, byChannel }));
  } catch {
    /* 保存できなくても、次回また取得するだけ */
  }
}

function isRecent(publishedAt: string, allowEmpty = false): boolean {
  if (!publishedAt) return allowEmpty;
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return allowEmpty;
  const now = Date.now();
  return t >= now - WINDOW_MS && t <= now + 24 * 60 * 60 * 1000;
}

function codeOf(e: unknown): string | null {
  return e instanceof YoutubeApiError ? e.code : null;
}
function isFatal(code: string | null): code is FatalCode {
  return code === 'NO_KEY' || code === 'KEY_REJECTED' || code === 'QUOTA_EXCEEDED';
}

function toTrack(v: YtVideo, strictness: Strictness, fallbackArtist: string): NewReleaseTrack | null {
  if (!v.embeddable) return null;
  // ライブ配信（配信中・予定）は長さが0になるため、長さの条件で除かれる
  if (v.durationSec < MIN_SEC || v.durationSec > MAX_SEC) return null;
  if (!isRecent(v.publishedAt)) return null;
  if (!isLikelyMusic(v.title, v.channelTitle, undefined, strictness)) return null;
  const meta = extractSmartTrackMeta(v.title, v.channelTitle || '');
  return {
    id: v.id,
    title: meta.cleanTitle || v.title,
    artist: meta.cleanArtist || v.channelTitle || fallbackArtist,
    channelId: v.channelId || undefined,
    genre: classifyMusicGenre(v.title, v.channelTitle || ''),
    playCount: 0,
    duration: v.durationSec,
    lastPlayed: '',
    isFavorite: false,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    publishedAt: v.publishedAt,
  };
}

async function refresh(targets: NewReleaseTarget[], strictness: Strictness): Promise<void> {
  const cache = loadCache();
  const now = Date.now();
  if (cache.failedAt && now - cache.failedAt < FAIL_BACKOFF_MS) return;

  const seen = new Set<string>();
  const due = targets
    .filter((t) => {
      if (seen.has(t.channelId)) return false;
      seen.add(t.channelId);
      const e = cache.byChannel[t.channelId];
      return !e || now - e.at >= REFRESH_INTERVAL_MS;
    })
    .sort((a, b) => (cache.byChannel[a.channelId]?.at ?? 0) - (cache.byChannel[b.channelId]?.at ?? 0))
    .slice(0, MAX_ARTISTS_PER_REFRESH);
  if (due.length === 0) return;

  const state: { fatal: FatalCode | null } = { fatal: null };
  const candidates = new Map<string, string>(); // videoId → 対象チャンネル
  const read = new Set<string>(); // 取得できた（または存在しなかった）チャンネル
  let next = 0;

  const worker = async () => {
    while (!state.fatal) {
      const t = due[next++];
      if (!t) return;
      try {
        const items = await getPlaylistVideos(uploadsPlaylistIdOf(t.channelId), {
          maxItems: MAX_PLAYLIST_ITEMS,
          ttlMs: REFRESH_INTERVAL_MS,
        });
        read.add(t.channelId);
        for (const it of items) {
          if (isRecent(it.publishedAt, true) && !candidates.has(it.videoId)) candidates.set(it.videoId, t.channelId);
        }
      } catch (e) {
        const code = codeOf(e);
        if (isFatal(code)) {
          state.fatal = code;
          return;
        }
        if (code === 'NOT_FOUND') read.add(t.channelId);
        else console.warn('[newReleases] playlist failed', t.channelId, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));

  let videos: YtVideo[] = [];
  let videosOk = true;
  if (!state.fatal && candidates.size > 0) {
    try {
      videos = await getVideos([...candidates.keys()], { ttlMs: REFRESH_INTERVAL_MS });
    } catch (e) {
      const code = codeOf(e);
      if (isFatal(code)) state.fatal = code;
      else {
        videosOk = false;
        console.warn('[newReleases] videos failed', e);
      }
    }
  }

  if (state.fatal) {
    console.warn('[newReleases] stopped:', state.fatal);
    saveCache({ ...cache, failedAt: now, failError: state.fatal });
    return;
  }
  if (!videosOk) return; // 動画の詳細が取れなかった分は保存せず、次回に取り直す

  const nameOf = new Map(due.map((t) => [t.channelId, t.name]));
  const next_: Cache = { byChannel: { ...cache.byChannel } };
  for (const id of read) next_.byChannel[id] = { at: now, items: [] };
  for (const v of videos) {
    const ch = candidates.get(v.id);
    if (!ch || !next_.byChannel[ch]) continue;
    const tr = toTrack(v, strictness, nameOf.get(ch) || '');
    if (tr) next_.byChannel[ch].items.push(tr);
  }
  saveCache(next_);
}

// 更新は1本ずつ順番に走らせる（ホームの開き直しや対象の変化で、同時に何本も走らせない）
let queue: Promise<void> = Promise.resolve();

export function useNewReleases(targets: NewReleaseTarget[], strictness: Strictness) {
  const [cache, setCache] = useState<Cache>(loadCache);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const strictRef = useRef(strictness);
  strictRef.current = strictness;
  const key = targets
    .map((t) => t.channelId)
    .sort()
    .join(',');

  useEffect(() => {
    if (!key) return;
    let alive = true;
    queue = queue
      .then(() => refresh(targetsRef.current, strictRef.current))
      .catch((e) => console.warn('[newReleases] refresh failed', e))
      .then(() => {
        if (alive) setCache(loadCache());
      });
    return () => {
      alive = false;
    };
  }, [key]);

  const tracks = useMemo(() => {
    const ids = new Set(key ? key.split(',') : []);
    const byId = new Map<string, NewReleaseTrack>();
    for (const [ch, entry] of Object.entries(cache.byChannel)) {
      if (!ids.has(ch)) continue;
      for (const t of entry.items) if (isRecent(t.publishedAt)) byId.set(t.id, t);
    }
    return [...byId.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, SHELF_MAX);
  }, [cache, key]);

  return { tracks, error: key ? cache.failError ?? null : null };
}

/** キャッシュ済みの新着（直近60日）を読むだけ。API は呼ばない（ラジオの選曲用） */
export function readCachedNewReleases(): NewReleaseTrack[] {
  const out: NewReleaseTrack[] = [];
  for (const entry of Object.values(loadCache().byChannel)) {
    for (const t of entry.items) if (isRecent(t.publishedAt)) out.push(t);
  }
  return out;
}
