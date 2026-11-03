// YouTubeの動画情報 → MusicTrack の共通変換。
// 以前は components/YoutubeUrlImport.tsx と utils/charts.ts に別々にあったものを、動作を変えずに1か所へ集めた。
// 検索結果（YoutubeSearchResults）も、同じ変換を通す。
import type { MusicTrack } from '../types/music';
import { classifyMusicGenre, extractSmartTrackMeta } from './parser';

export interface VideoSource {
  id: string;
  title: string;
  /** 投稿したチャンネルの名前（アーティスト名の手がかり） */
  channelTitle: string;
  channelId?: string;
  durationSec?: number | null;
}

const thumbOf = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** 再生履歴つきで取り込む曲（URL取込）: 再生1回・今の日時。duration は持たない */
export function buildImportedTrack(v: VideoSource, now: string): MusicTrack {
  const meta = extractSmartTrackMeta(v.title, v.channelTitle);
  return {
    id: v.id,
    title: meta.cleanTitle,
    artist: meta.cleanArtist,
    channelId: v.channelId || undefined,
    genre: classifyMusicGenre(v.title, v.channelTitle),
    playCount: 1,
    lastPlayed: now,
    firstPlayed: now,
    isFavorite: false,
    thumbnailUrl: thumbOf(v.id),
  };
}

/** まだ再生していない曲（チャート・検索結果）: 再生0回・最終再生は空。長さは分かっていれば入れる */
export function buildCatalogTrack(v: VideoSource): MusicTrack {
  const meta = extractSmartTrackMeta(v.title, v.channelTitle || '');
  return {
    id: v.id,
    title: meta.cleanTitle || v.title,
    artist: meta.cleanArtist || v.channelTitle,
    channelId: v.channelId,
    genre: classifyMusicGenre(v.title, v.channelTitle || ''),
    playCount: 0,
    duration: v.durationSec ?? null,
    lastPlayed: '',
    isFavorite: false,
    thumbnailUrl: thumbOf(v.id),
  };
}
