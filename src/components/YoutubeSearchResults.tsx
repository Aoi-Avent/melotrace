import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search as SearchIcon, Star } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { navSetTab } from '../utils/nav';
import { saveArtistChannel } from '../utils/artistChannels';
import { normalizeName } from '../utils/textMatch';
import { buildCatalogTrack } from '../utils/videoToTrack';
import {
  loadYoutubeUsage,
  normalizeSearchQuery,
  searchMusicVideos,
  SEARCH_UNITS_PER_PAGE,
  useYoutubeApiKeySource,
  useYoutubeUsage,
  YoutubeApiError,
  type YtVideo,
} from '../utils/youtubeApi';
import { requestKeyCardFocus } from './YoutubeApiKeyCard';

interface Props {
  /** 検索欄に入っている文字（1文字以上のときだけ表示される） */
  query: string;
  /** ライブラリ内の結果が0件のとき true（中央に置く） */
  centered: boolean;
}

interface Found {
  q: string;
  videos: YtVideo[];
  next: string;
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const nowStr = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

/**
 * 検索画面の「YouTube全体から探す」。ボタンを押したときだけ検索する（入力のたびには呼ばない）。
 * API消費の見積もり: 1回の検索 約101ユニット（search.list 100 + videos.list 1）。「もっと見る」も1回ごとに約101ユニット。
 * 同じ検索語は24時間キャッシュされ、その間は 0ユニット。
 */
export const YoutubeSearchResults: React.FC<Props> = ({ query, centered }) => {
  const { tracks: library, favoriteArtists, playTrack, appendTracks, addFavoriteArtists } = usePlayer();
  const source = useYoutubeApiKeySource();
  // 「あと約N回」は自分のキー（'user'）の分だけ。共有キーで使った分は混ぜない
  const usage = useYoutubeUsage('user');
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedChannels, setSavedChannels] = useState<Set<string>>(new Set());
  useEffect(() => {
    void loadYoutubeUsage();
  }, []);

  const trimmed = query.trim();
  const q = normalizeSearchQuery(query);
  const shown = found && found.q === q ? found : null;

  const tracks = useMemo(
    () =>
      (shown?.videos ?? []).map((v) =>
        buildCatalogTrack({ id: v.id, title: v.title, channelTitle: v.channelTitle, channelId: v.channelId, durationSec: v.durationSec }),
      ),
    [shown],
  );
  const inLibrary = useMemo(() => new Set(library.map((t) => t.id)), [library]);
  const favKeys = useMemo(() => new Set(favoriteArtists.map((a) => normalizeName(a))), [favoriteArtists]);

  if (!trimmed) return null;

  const remaining = Math.max(0, Math.floor((usage.limit - usage.units) / SEARCH_UNITS_PER_PAGE));

  const run = async (pageToken?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const page = await searchMusicVideos(query, { pageToken });
      setFound((prev) => {
        const base = pageToken && prev && prev.q === q ? prev.videos : [];
        const have = new Set(base.map((v) => v.id));
        return { q, videos: [...base, ...page.videos.filter((v) => !have.has(v.id))], next: page.nextPageToken };
      });
    } catch (e) {
      setError(e instanceof YoutubeApiError ? e.message : '検索できませんでした。時間をおいて試してください。');
    } finally {
      setBusy(false);
    }
  };

  const goKeyCard = () => {
    requestKeyCardFocus();
    navSetTab('import');
  };

  const addToFavorites = (name: string, channelId: string, channelTitle: string) => {
    saveArtistChannel(name, { channelId, title: channelTitle });
    addFavoriteArtists([name]);
    setSavedChannels((s) => new Set(s).add(channelId));
  };

  /* キーが無い（共有キーのみ）ときは、ボタンの代わりに案内だけ。API は呼ばない */
  if (source !== 'user') {
    return (
      <div className={`mt-6 ${centered ? 'text-center' : ''}`}>
        <p className="text-xs text-muted leading-relaxed">YouTube全体の検索には、あなた自身のAPIキーが必要です。</p>
        <button onClick={goKeyCard} className="mt-1 text-xs text-accent font-semibold underline underline-offset-2">
          YouTube APIキーを入力する
        </button>
      </div>
    );
  }

  const outOfQuota = remaining <= 0;

  return (
    <div className={`mt-6 ${centered && !shown ? 'text-center' : ''}`}>
      {!shown && (
        <>
          <button
            type="button"
            onClick={() => run()}
            disabled={busy || outOfQuota}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-on-accent text-sm font-semibold active:scale-95 disabled:opacity-50 max-w-full"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <SearchIcon className="w-4 h-4 shrink-0" />}
            <span className="truncate">YouTube全体から探す: {trimmed}</span>
          </button>
          <p className="text-[11px] text-muted mt-1.5">
            {outOfQuota ? '今日の検索の上限に達しました。' : `今日の検索はあと約${remaining}回`}
          </p>
        </>
      )}

      {error && <p className="text-[11px] text-red-400 mt-2 leading-relaxed">{error}</p>}

      {shown && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-fg tracking-tight">YouTubeの検索結果 ({shown.videos.length})</h2>
            <span className="text-[10px] text-muted">今日の検索はあと約{remaining}回</span>
          </div>

          {shown.videos.length === 0 && <p className="text-xs text-muted py-4">条件に合う音楽動画は見つかりませんでした。</p>}

          <div className="divide-y divide-fg/5">
            {shown.videos.map((v, i) => {
              const track = tracks[i];
              if (!track) return null;
              const added = inLibrary.has(v.id);
              const isFav = favKeys.has(normalizeName(track.artist)) || (!!v.channelId && savedChannels.has(v.channelId));
              return (
                <div
                  key={v.id}
                  onClick={() => playTrack(track, tracks)}
                  className="flex items-center justify-between py-2.5 px-2 rounded-xl cursor-pointer active:bg-fg/10 hover:bg-fg/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-2 border border-fg/10">
                      <img src={v.thumbnail || track.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">{v.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <span className="text-[11px] text-muted truncate">{v.channelTitle}</span>
                        <span className="text-muted text-[9px] shrink-0">•</span>
                        <span className="text-[10px] text-muted shrink-0">{fmt(v.durationSec)}</span>
                      </div>
                      {v.channelId && (
                        <button
                          type="button"
                          disabled={isFav}
                          onClick={(e) => {
                            e.stopPropagation();
                            addToFavorites(track.artist, v.channelId, v.channelTitle);
                          }}
                          className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent font-semibold disabled:text-muted"
                        >
                          <Star className={`w-3 h-3 ${isFav ? 'fill-current' : ''}`} />
                          {isFav ? 'お気に入り済み' : 'お気に入りに追加'}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={added ? 'ライブラリに追加済み' : 'ライブラリに追加'}
                    disabled={added}
                    onClick={(e) => {
                      e.stopPropagation();
                      const now = nowStr();
                      appendTracks([{ ...track, lastPlayed: now, firstPlayed: now }]);
                    }}
                    className="p-2 text-muted hover:text-accent shrink-0 disabled:opacity-60"
                  >
                    {added ? <Check className="w-4 h-4 text-accent" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>

          {shown.next && (
            <div className="py-3 text-center">
              <button
                type="button"
                onClick={() => run(shown.next)}
                disabled={busy || remaining <= 0}
                className="px-4 py-2 rounded-full bg-fg/10 hover:bg-fg/15 text-fg text-xs font-semibold disabled:opacity-50"
              >
                {busy ? '読み込み中…' : 'もっと見る'}
              </button>
              <p className="text-[10px] text-muted mt-1">さらに約{SEARCH_UNITS_PER_PAGE}ユニットかかります</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
