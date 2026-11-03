// 「この曲からラジオ」の選曲ロジック。PlayerContext には依存しない。
// ・search.list は一切呼ばない（relatedToVideoId は廃止済み）
// ・情報源: 1) 同じアーティスト  2) charts.json  3) 新着キャッシュ  4) ライブラリの同ジャンル/同アーティスト
// ・API消費の見積もり: 同じアーティストの uploads を取るときだけ
//     playlistItems.list 1ユニット（maxItems=10）＋ videos.list 1ユニット（長さ・埋め込み可否の確認）
//   どちらも youtubeApi 側のキャッシュ（6h / 12h）が効くので、同じチャンネルの2回目以降は0ユニット。
//   チャンネル未解決・キー無し・エラー時は何も呼ばず（または諦めて）、ライブラリ内の同じアーティストで代替する。
import type { MusicTrack } from '../types/music';
import { classifyMusicGenre, extractSmartTrackMeta } from './parser';
import { normalizeName } from './textMatch';
import { getPlaylistVideos, getVideos } from './youtubeApi';
import { uploadsPlaylistIdOf } from './youtubeUrl';

export interface RadioContext {
  /** ライブラリ（BGM除く・非表示の曲は含まない想定） */
  library: MusicTrack[];
  /** charts.json の曲 */
  charts: MusicTrack[];
  /** T5 の新着キャッシュの曲 */
  newReleases: MusicTrack[];
  /** 直近に再生した曲・キュー内の曲のID（重複させない） */
  recentIds: Iterable<string>;
  /** 再生できないと分かっている曲のID */
  unplayable: Set<string>;
  /** 非表示（Ban）の曲・アーティストなら true */
  isBlocked?: (t: MusicTrack) => boolean;
  /** この補充の直前に流れる曲のアーティスト（同じ人が連続しないように並べるため） */
  prevArtist?: string;
}

export const RADIO_BATCH_SIZE = 10;
const QUOTA = { artist: 4, charts: 2, fresh: 2, library: 2 } as const;
const MIN_SEC = 60;
const MAX_SEC = 20 * 60;
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

const keyOf = (t: MusicTrack) => normalizeName(t.artist || '');

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** seed のチャンネルID。曲に無ければ、ライブラリ → charts の同じアーティストの曲から最頻のものを使う */
function resolveChannelId(seed: MusicTrack, ctx: RadioContext): string | null {
  if (seed.channelId && CHANNEL_ID_RE.test(seed.channelId)) return seed.channelId;
  const key = keyOf(seed);
  if (!key) return null;
  for (const pool of [ctx.library, ctx.charts]) {
    const counts = new Map<string, number>();
    for (const t of pool) {
      if (!t.channelId || !CHANNEL_ID_RE.test(t.channelId) || keyOf(t) !== key) continue;
      counts.set(t.channelId, (counts.get(t.channelId) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    counts.forEach((n, id) => {
      if (n > bestN) {
        best = id;
        bestN = n;
      }
    });
    if (best) return best;
  }
  return null;
}

/** 同じチャンネルの最近のアップロード（最大10件）。失敗したら空配列（静かに諦める） */
async function fetchUploads(channelId: string): Promise<MusicTrack[]> {
  try {
    const vids = await getPlaylistVideos(uploadsPlaylistIdOf(channelId), { maxItems: 10 });
    if (vids.length === 0) return [];
    const details = await getVideos(vids.map((v) => v.videoId));
    const out: MusicTrack[] = [];
    for (const v of details) {
      if (!v.embeddable || v.durationSec < MIN_SEC || v.durationSec > MAX_SEC) continue;
      const meta = extractSmartTrackMeta(v.title, v.channelTitle);
      out.push({
        id: v.id,
        title: meta.cleanTitle || v.title,
        artist: meta.cleanArtist || v.channelTitle,
        channelId: v.channelId,
        genre: classifyMusicGenre(v.title, v.channelTitle),
        playCount: 0,
        duration: v.durationSec,
        lastPlayed: '',
        isFavorite: false,
        thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** 同じアーティストが連続しないように並べ替える（先頭は prevArtist とも続かないようにする） */
function spreadArtists(list: MusicTrack[], prevArtist?: string): MusicTrack[] {
  const rest = list.slice();
  const out: MusicTrack[] = [];
  let prev = prevArtist ? normalizeName(prevArtist) : '';
  while (rest.length > 0) {
    let i = rest.findIndex((t) => keyOf(t) !== prev);
    if (i < 0) i = 0;
    const [t] = rest.splice(i, 1);
    out.push(t);
    prev = keyOf(t);
  }
  return out;
}

/** seed に続けて流す関連曲を最大10曲選ぶ。例外は投げない（失敗時は集まった分だけ返す） */
export async function buildRadioBatch(seed: MusicTrack, ctx: RadioContext): Promise<MusicTrack[]> {
  const exclude = new Set<string>(ctx.recentIds);
  exclude.add(seed.id);
  const ok = (t: MusicTrack): boolean => {
    if (!t.id || exclude.has(t.id) || ctx.unplayable.has(t.id)) return false;
    if (ctx.isBlocked?.(t)) return false;
    if (typeof t.duration === 'number' && (t.duration < MIN_SEC || t.duration > MAX_SEC)) return false;
    return true;
  };

  const seedKey = keyOf(seed);
  const lib = ctx.library.filter(ok);

  // 1) 同じアーティスト（uploads → ライブラリ内の同じアーティスト）
  const channelId = resolveChannelId(seed, ctx);
  const uploads = channelId ? (await fetchUploads(channelId)).filter(ok) : [];
  const sameArtistLib = seedKey ? lib.filter((t) => keyOf(t) === seedKey) : [];
  const s1 = shuffle([...uploads, ...sameArtistLib]);

  // 2) charts.json  3) 新着キャッシュ
  const s2 = shuffle(ctx.charts.filter(ok));
  const s3 = shuffle(ctx.newReleases.filter(ok));

  // 4) ライブラリの同ジャンル・同アーティストで、最近聴いていない曲（古い側7割からランダム）
  const related = lib.filter((t) => (seedKey && keyOf(t) === seedKey) || (seed.genre && t.genre === seed.genre));
  const byOld = related.slice().sort((a, b) => (a.lastPlayed || '').localeCompare(b.lastPlayed || ''));
  const s4 = shuffle(byOld.slice(0, Math.max(Math.ceil(byOld.length * 0.7), QUOTA.library)));

  const taken = new Set<string>();
  const picked: { src: number; t: MusicTrack }[] = [];
  const take = (src: number, list: MusicTrack[], n: number) => {
    let c = 0;
    for (const t of list) {
      if (c >= n || picked.length >= RADIO_BATCH_SIZE) break;
      if (taken.has(t.id)) continue;
      taken.add(t.id);
      picked.push({ src, t });
      c++;
    }
  };
  take(0, s1, QUOTA.artist);
  take(1, s2, QUOTA.charts);
  take(2, s3, QUOTA.fresh);
  take(3, s4, QUOTA.library);
  // 足りない分は、他の情報源の余りで埋める（ライブラリ → 同じアーティスト → charts → 新着）
  for (const [src, list] of [[3, s4], [0, s1], [1, s2], [2, s3]] as [number, MusicTrack[]][]) {
    take(src, list, RADIO_BATCH_SIZE);
  }

  // 情報源が偏らないよう、順番に1曲ずつ取り出してから、同じアーティストが連続しないよう整える
  const groups = [0, 1, 2, 3].map((s) => picked.filter((p) => p.src === s).map((p) => p.t));
  const mixed: MusicTrack[] = [];
  for (let i = 0; mixed.length < picked.length; i++) {
    for (const g of groups) if (i < g.length) mixed.push(g[i]);
  }
  // ライブラリ由来の曲も「キューだけの曲」として扱う（再生回数・最終再生を動かさない）
  return spreadArtists(mixed, ctx.prevArtist || seed.artist).map((t) => ({ ...t, isRadio: true }));
}
