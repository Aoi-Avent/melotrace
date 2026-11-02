/**
 * YouTube Data API v3 共通クライアント。
 *
 * 他の機能からは1行で呼べる:
 *   const items  = await getPlaylistVideos('PLxxxx');
 *   const videos = await getVideos(['id1', 'id2']);
 *   const chans  = await getChannels(['UCxxxx']);
 *   const hits   = await getPopularMusicVideos();            // 既定: JP
 *
 * - 使うのは playlistItems.list / videos.list / channels.list のみ（search.list は使わない）。
 *   どれも 1ユニット/回。1日の上限は 10,000 ユニット（太平洋時間の0時にリセット）。
 * - APIキー: 設定で入力した任意キー（setYoutubeApiKey）→ なければビルド時の VITE_YOUTUBE_API_KEY。
 * - 結果は IndexedDB（db.ts と同じDB）にキャッシュ。有効期間内は API を呼ばない。
 * - 実際に送ったリクエストだけを、日ごとに概算ユニットとして記録する。
 * - エラーは握りつぶさず YoutubeApiError（message は画面にそのまま出せる日本語）として投げる。
 */
import { useSyncExternalStore } from 'react';
import { openDB, STORE_YT_CACHE, STORE_YT_USAGE } from './db';
import { getPref, setPref } from './uiPrefs';

/* ------------------------------------------------------------------ */
/* 型                                                                  */
/* ------------------------------------------------------------------ */

export interface YtPlaylistVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  /** 動画の公開日時（ISO 8601）。不明なら空文字 */
  publishedAt: string;
  position: number;
}

export interface YtVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  /** "10" = Music */
  categoryId: string;
  thumbnail: string;
  publishedAt: string;
  durationSec: number;
  /** 非公開設定などで取れない場合は null */
  viewCount: number | null;
  likeCount: number | null;
  /** 埋め込み再生が許可されているか */
  embeddable: boolean;
}

export interface YtChannel {
  id: string;
  title: string;
  customUrl: string;
  thumbnail: string;
  /** 登録者数を非表示にしているチャンネルは null */
  subscriberCount: number | null;
  videoCount: number | null;
  /** アップロード動画の一覧（getPlaylistVideos にそのまま渡せる） */
  uploadsPlaylistId: string;
}

export type YtErrorCode =
  | 'NO_KEY'
  | 'KEY_REJECTED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'HTTP';

export class YoutubeApiError extends Error {
  code: YtErrorCode;
  status?: number;
  reason?: string;
  constructor(code: YtErrorCode, message: string, extra?: { status?: number; reason?: string }) {
    super(message);
    this.name = 'YoutubeApiError';
    this.code = code;
    this.status = extra?.status;
    this.reason = extra?.reason;
  }
}

export interface YtCallOptions {
  /** true ならキャッシュを無視して取り直す（ユニットを消費する） */
  force?: boolean;
  /** キャッシュの有効時間(ms)。省略時は種類ごとの既定値 */
  ttlMs?: number;
}

/* ------------------------------------------------------------------ */
/* 定数                                                                */
/* ------------------------------------------------------------------ */

const API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YT_DAILY_QUOTA = 10000;
/** playlistItems / videos / channels の list は、1回あたり1ユニット */
const COST_PER_LIST_CALL = 1;
const MAX_IDS_PER_CALL = 50;
const REQUEST_TIMEOUT_MS = 15000;
const MUSIC_CATEGORY_ID = '10';

const HOUR = 60 * 60 * 1000;
const TTL = {
  playlist: 6 * HOUR,
  video: 12 * HOUR,
  channel: 24 * HOUR,
  popular: 3 * HOUR,
} as const;

const USER_KEY_PREF = 'melotrace_yt_api_key_v1';
const USAGE_KEEP_DAYS = 90;

/* ------------------------------------------------------------------ */
/* APIキー                                                             */
/* ------------------------------------------------------------------ */

/** 設定で入力した任意キーを保存する（空文字で削除。ビルド時のキーに戻る） */
export function setYoutubeApiKey(key: string): void {
  setPref(USER_KEY_PREF, key.trim());
}

export function getYoutubeApiKeySource(): 'user' | 'build' | 'none' {
  if (getPref(USER_KEY_PREF, '').trim()) return 'user';
  if (buildTimeKey()) return 'build';
  return 'none';
}

function buildTimeKey(): string {
  const v = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined;
  return (v || '').trim();
}

function resolveApiKey(): string {
  return getPref(USER_KEY_PREF, '').trim() || buildTimeKey();
}

/* ------------------------------------------------------------------ */
/* IndexedDB の小さなヘルパー（失敗しても API 呼び出しは止めない）           */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDB().then((db) => {
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      return db;
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function reqDone<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ------------------------------------------------------------------ */
/* キャッシュ                                                           */
/* ------------------------------------------------------------------ */

interface CacheRow {
  key: string;
  value: unknown;
  expiresAt: number;
}

let pruned = false;

async function pruneOnce(): Promise<void> {
  if (pruned) return;
  pruned = true;
  try {
    const db = await getDB();
    const now = Date.now();
    const tx = db.transaction([STORE_YT_CACHE, STORE_YT_USAGE], 'readwrite');
    const cacheStore = tx.objectStore(STORE_YT_CACHE);
    const cur = cacheStore.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return;
      if ((c.value as CacheRow).expiresAt < now) c.delete();
      c.continue();
    };
    const oldest = quotaDay(now - USAGE_KEEP_DAYS * 24 * HOUR);
    tx.objectStore(STORE_YT_USAGE).delete(IDBKeyRange.upperBound(oldest, true));
    await txDone(tx);
  } catch (err) {
    console.warn('youtubeApi: prune failed', err);
  }
}

async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    void pruneOnce();
    const row = (await reqDone(db.transaction(STORE_YT_CACHE, 'readonly').objectStore(STORE_YT_CACHE).get(key))) as
      | CacheRow
      | undefined;
    if (!row || row.expiresAt < Date.now()) return undefined;
    return row.value as T;
  } catch (err) {
    console.warn('youtubeApi: cache read failed', err);
    return undefined;
  }
}

async function cachePut(key: string, value: unknown, ttlMs: number): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_YT_CACHE, 'readwrite');
    tx.objectStore(STORE_YT_CACHE).put({ key, value, expiresAt: Date.now() + ttlMs } as CacheRow);
    await txDone(tx);
  } catch (err) {
    console.warn('youtubeApi: cache write failed', err);
  }
}

const inflight = new Map<string, Promise<unknown>>();

/** キャッシュ → 実行中の同一呼び出しに相乗り → 新規取得、の順で結果を返す */
async function cached<T>(key: string, ttlMs: number, force: boolean | undefined, produce: () => Promise<T>): Promise<T> {
  if (!force) {
    const hit = await cacheGet<T>(key);
    if (hit !== undefined) return hit;
  }
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = (async () => {
    const v = await produce();
    await cachePut(key, v, ttlMs);
    return v;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    if (inflight.get(key) === p) inflight.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* 使用量（日ごとの概算ユニット）                                          */
/* ------------------------------------------------------------------ */

export interface YtUsageDay {
  /** クォータの日付（太平洋時間, YYYY-MM-DD） */
  date: string;
  units: number;
  calls: number;
  /** Google から「上限到達」と返された日は true */
  exhausted: boolean;
}

export interface YtUsageSnapshot extends YtUsageDay {
  limit: number;
  /** 直近の API エラー（このセッション内）。画面にそのまま出せる文言 */
  lastError: string;
}

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YouTube のクォータは太平洋時間の0時にリセットされるので、日付もそれに合わせる */
function quotaDay(now: number = Date.now()): string {
  return dayFmt.format(now);
}

let snapshot: YtUsageSnapshot = { date: quotaDay(), units: 0, calls: 0, exhausted: false, limit: YT_DAILY_QUOTA, lastError: '' };
let usageLoaded: Promise<void> | null = null;
const usageListeners = new Set<() => void>();

function emitUsage(patch: Partial<YtUsageSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  usageListeners.forEach((l) => l());
}

async function persistUsage(): Promise<void> {
  try {
    const db = await getDB();
    const { date, units, calls, exhausted } = snapshot;
    const tx = db.transaction(STORE_YT_USAGE, 'readwrite');
    tx.objectStore(STORE_YT_USAGE).put({ date, units, calls, exhausted } as YtUsageDay);
    await txDone(tx);
  } catch (err) {
    console.warn('youtubeApi: usage write failed', err);
  }
}

/** 今日の使用量をDBから読み込む（日付が変わっていれば0から数え直す）。何度呼んでも安全 */
export function loadYoutubeUsage(): Promise<void> {
  const today = quotaDay();
  if (usageLoaded && snapshot.date === today) return usageLoaded;
  usageLoaded = (async () => {
    let row: YtUsageDay | undefined;
    try {
      const db = await getDB();
      row = (await reqDone(db.transaction(STORE_YT_USAGE, 'readonly').objectStore(STORE_YT_USAGE).get(today))) as
        | YtUsageDay
        | undefined;
    } catch (err) {
      console.warn('youtubeApi: usage read failed', err);
    }
    emitUsage({ date: today, units: row?.units ?? 0, calls: row?.calls ?? 0, exhausted: row?.exhausted ?? false });
  })();
  return usageLoaded;
}

/** 直近 days 日分の使用量（新しい順） */
export async function getYoutubeUsageHistory(days = 14): Promise<YtUsageDay[]> {
  try {
    const db = await getDB();
    const rows = (await reqDone(db.transaction(STORE_YT_USAGE, 'readonly').objectStore(STORE_YT_USAGE).getAll())) as YtUsageDay[];
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, days);
  } catch (err) {
    console.warn('youtubeApi: usage history failed', err);
    return [];
  }
}

function subscribeUsage(cb: () => void): () => void {
  usageListeners.add(cb);
  return () => usageListeners.delete(cb);
}

/** 設定画面の「今日の使用量」表示用 */
export function useYoutubeUsage(): YtUsageSnapshot {
  return useSyncExternalStore(subscribeUsage, () => snapshot, () => snapshot);
}

/* ------------------------------------------------------------------ */
/* エラー                                                              */
/* ------------------------------------------------------------------ */

function reportError(err: YoutubeApiError): YoutubeApiError {
  emitUsage({ lastError: err.message });
  return err;
}

function quotaMessage(): string {
  return `YouTube APIの1日の上限（${YT_DAILY_QUOTA.toLocaleString()}ユニット）に達しました。日本時間の16〜17時ごろ（太平洋時間の0時）にリセットされるまで、新しい取得はできません。`;
}

async function toApiError(res: Response): Promise<YoutubeApiError> {
  let reason = '';
  let detail = '';
  try {
    const body = await res.json();
    const e = body?.error;
    reason = e?.errors?.[0]?.reason || e?.details?.[0]?.reason || e?.status || '';
    detail = e?.message || '';
  } catch {
    /* 本文が JSON でなくても status で判定する */
  }
  const extra = { status: res.status, reason };

  if (res.status === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) {
    return new YoutubeApiError('QUOTA_EXCEEDED', quotaMessage(), extra);
  }
  if (res.status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')) {
    return new YoutubeApiError('RATE_LIMITED', 'YouTube APIへのリクエストが短時間に集中しています。少し待ってからやり直してください。', extra);
  }
  if (
    res.status === 400 ||
    res.status === 401 ||
    res.status === 403
  ) {
    const keyProblem = /key|referer|referrer|accessNotConfigured|SERVICE_DISABLED|PERMISSION_DENIED/i.test(`${reason} ${detail}`);
    if (keyProblem) {
      return new YoutubeApiError(
        'KEY_REJECTED',
        `YouTube APIキーが使えません（${reason || res.status}）。キーの値、YouTube Data API v3の有効化、リファラ制限の設定を確認してください。`,
        extra,
      );
    }
  }
  if (res.status === 404) {
    return new YoutubeApiError('NOT_FOUND', 'YouTube上で見つかりませんでした（非公開・削除、または対象外の可能性があります）。', extra);
  }
  return new YoutubeApiError('HTTP', `YouTube APIエラー（${res.status}${reason ? ` / ${reason}` : ''}）`, extra);
}

/* ------------------------------------------------------------------ */
/* HTTP（ここだけが実際にAPIを叩く）                                       */
/* ------------------------------------------------------------------ */

type Params = Record<string, string | number | undefined>;

async function callApi(endpoint: 'playlistItems' | 'videos' | 'channels', params: Params): Promise<any> {
  await loadYoutubeUsage();

  const key = resolveApiKey();
  if (!key) {
    throw reportError(
      new YoutubeApiError('NO_KEY', 'YouTube APIキーが設定されていません。設定でキーを入力するか、ビルド時に VITE_YOUTUBE_API_KEY を設定してください。'),
    );
  }
  if (snapshot.exhausted || snapshot.units + COST_PER_LIST_CALL > YT_DAILY_QUOTA) {
    throw reportError(new YoutubeApiError('QUOTA_EXCEEDED', quotaMessage()));
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  qs.set('key', key);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${endpoint}?${qs.toString()}`, { signal: ctrl.signal });
  } catch {
    throw reportError(new YoutubeApiError('NETWORK', 'YouTube APIに接続できませんでした。通信状況を確認してください。'));
  } finally {
    clearTimeout(timer);
  }

  // 応答が返った時点で1リクエスト分としてカウント（失敗応答も Google 側では消費されうる）
  emitUsage({ units: snapshot.units + COST_PER_LIST_CALL, calls: snapshot.calls + 1 });

  if (!res.ok) {
    const err = await toApiError(res);
    if (err.code === 'QUOTA_EXCEEDED') emitUsage({ exhausted: true });
    void persistUsage();
    throw reportError(err);
  }
  void persistUsage();
  emitUsage({ lastError: '' });
  return res.json();
}

/* ------------------------------------------------------------------ */
/* 変換                                                                */
/* ------------------------------------------------------------------ */

function pickThumb(t: any): string {
  return t?.medium?.url || t?.high?.url || t?.default?.url || t?.standard?.url || '';
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ISO 8601 の長さ（PT1H2M3S）→ 秒 */
function parseDuration(iso: string | undefined): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [d, h, mi, s] = [m[1], m[2], m[3], m[4]].map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

function mapVideo(it: any): YtVideo {
  const sn = it.snippet || {};
  return {
    id: it.id,
    title: sn.title || '',
    channelId: sn.channelId || '',
    channelTitle: sn.channelTitle || '',
    categoryId: sn.categoryId || '',
    thumbnail: pickThumb(sn.thumbnails),
    publishedAt: sn.publishedAt || '',
    durationSec: parseDuration(it.contentDetails?.duration),
    viewCount: toNum(it.statistics?.viewCount),
    likeCount: toNum(it.statistics?.likeCount),
    embeddable: it.status?.embeddable !== false,
  };
}

function mapChannel(it: any): YtChannel {
  const sn = it.snippet || {};
  const st = it.statistics || {};
  return {
    id: it.id,
    title: sn.title || '',
    customUrl: sn.customUrl || '',
    thumbnail: pickThumb(sn.thumbnails),
    subscriberCount: st.hiddenSubscriberCount ? null : toNum(st.subscriberCount),
    videoCount: toNum(st.videoCount),
    uploadsPlaylistId: it.contentDetails?.relatedPlaylists?.uploads || '',
  };
}

const VIDEO_PARTS = 'snippet,contentDetails,statistics,status';

/* ------------------------------------------------------------------ */
/* 公開API                                                             */
/* ------------------------------------------------------------------ */

/**
 * プレイリストの動画一覧（playlistItems.list）。1ページ50件=1ユニット。
 * maxItems の既定は50件（1ユニット）、上限は500件。非公開・削除済みの動画は除く。
 */
export async function getPlaylistVideos(
  playlistId: string,
  opts: YtCallOptions & { maxItems?: number } = {},
): Promise<YtPlaylistVideo[]> {
  const maxItems = Math.min(Math.max(opts.maxItems ?? 50, 1), 500);
  return cached(`playlist:${playlistId}:${maxItems}`, opts.ttlMs ?? TTL.playlist, opts.force, async () => {
    const out: YtPlaylistVideo[] = [];
    let pageToken: string | undefined;
    do {
      const data = await callApi('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: Math.min(50, maxItems - out.length),
        pageToken,
      });
      for (const it of data.items || []) {
        const sn = it.snippet || {};
        const videoId: string = it.contentDetails?.videoId || sn.resourceId?.videoId || '';
        if (!videoId || sn.title === 'Private video' || sn.title === 'Deleted video') continue;
        out.push({
          videoId,
          title: sn.title || '',
          channelId: sn.videoOwnerChannelId || '',
          channelTitle: sn.videoOwnerChannelTitle || '',
          thumbnail: pickThumb(sn.thumbnails),
          publishedAt: it.contentDetails?.videoPublishedAt || '',
          position: typeof sn.position === 'number' ? sn.position : out.length,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken && out.length < maxItems);
    return out.slice(0, maxItems);
  });
}

/** 動画の詳細（videos.list）。動画ごとにキャッシュし、足りない分だけ50件ずつまとめて取得する。 */
export async function getVideos(ids: string[], opts: YtCallOptions = {}): Promise<YtVideo[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const found = new Map<string, YtVideo>();
  const missing: string[] = [];
  for (const id of unique) {
    const hit = opts.force ? undefined : await cacheGet<YtVideo>(`video:${id}`);
    if (hit) found.set(id, hit);
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += MAX_IDS_PER_CALL) {
    const chunk = missing.slice(i, i + MAX_IDS_PER_CALL);
    const data = await callApi('videos', { part: VIDEO_PARTS, id: chunk.join(','), maxResults: MAX_IDS_PER_CALL });
    for (const it of data.items || []) {
      const v = mapVideo(it);
      found.set(v.id, v);
      await cachePut(`video:${v.id}`, v, opts.ttlMs ?? TTL.video);
    }
  }
  return unique.map((id) => found.get(id)).filter((v): v is YtVideo => !!v);
}

/** チャンネルの詳細（channels.list）。getVideos と同じく、チャンネルごとにキャッシュする。 */
export async function getChannels(ids: string[], opts: YtCallOptions = {}): Promise<YtChannel[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const found = new Map<string, YtChannel>();
  const missing: string[] = [];
  for (const id of unique) {
    const hit = opts.force ? undefined : await cacheGet<YtChannel>(`channel:${id}`);
    if (hit) found.set(id, hit);
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += MAX_IDS_PER_CALL) {
    const chunk = missing.slice(i, i + MAX_IDS_PER_CALL);
    const data = await callApi('channels', { part: 'snippet,statistics,contentDetails', id: chunk.join(','), maxResults: MAX_IDS_PER_CALL });
    for (const it of data.items || []) {
      const c = mapChannel(it);
      found.set(c.id, c);
      await cachePut(`channel:${c.id}`, c, opts.ttlMs ?? TTL.channel);
    }
  }
  return unique.map((id) => found.get(id)).filter((c): c is YtChannel => !!c);
}

/**
 * 地域の「音楽」カテゴリの人気動画（videos.list + chart=mostPopular）。
 * 案1: まず regionCode + videoCategoryId=10 で取得し、videoChartNotFound か空なら、
 * カテゴリ指定なしで人気チャート（最大50件）を取得して snippet.categoryId === "10" でclient側で絞り込む。
 * 通常は1ユニット、切り替え時は2ユニット。
 */
export async function getPopularMusicVideos(
  opts: YtCallOptions & { regionCode?: string; maxResults?: number } = {},
): Promise<YtVideo[]> {
  const region = (opts.regionCode || 'JP').toUpperCase();
  const maxResults = Math.min(Math.max(opts.maxResults ?? 50, 1), 50);

  return cached(`popularMusic:${region}:${maxResults}`, opts.ttlMs ?? TTL.popular, opts.force, async () => {
    let items: any[] = [];
    let needFallback = false;
    try {
      const data = await callApi('videos', {
        part: VIDEO_PARTS,
        chart: 'mostPopular',
        regionCode: region,
        videoCategoryId: MUSIC_CATEGORY_ID,
        maxResults,
      });
      items = data.items || [];
      needFallback = items.length === 0;
    } catch (err) {
      if (err instanceof YoutubeApiError && err.reason === 'videoChartNotFound') needFallback = true;
      else throw err;
    }

    let videos: YtVideo[];
    if (needFallback) {
      const data = await callApi('videos', {
        part: VIDEO_PARTS,
        chart: 'mostPopular',
        regionCode: region,
        maxResults: 50,
      });
      videos = ((data.items || []) as any[])
        .map(mapVideo)
        .filter((v) => v.categoryId === MUSIC_CATEGORY_ID)
        .slice(0, maxResults);
    } else {
      videos = items.map(mapVideo);
    }

    // 同じ動画を getVideos で引いたときに再取得しないよう、個別キャッシュにも入れておく
    await Promise.all(videos.map((v) => cachePut(`video:${v.id}`, v, TTL.video)));
    return videos;
  });
}
