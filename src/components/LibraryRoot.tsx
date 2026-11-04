import React, { useMemo } from 'react';
import { ChevronRight, ListMusic, Mic2, Music, Disc3, Headphones, Star, Heart, History, CalendarDays } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { PageHeader } from './PageHeader';
import { navLib, LibRoute } from '../utils/nav';

/** ライブラリの入口: カテゴリの一覧と「最近追加した項目」 */
export const LibraryRoot: React.FC = () => {
  const { activeTracks, musicTracks, bgmTracks, playlists, favoriteArtists, playTrack, albumArtFor, artworkSource } = usePlayer();

  const counts = useMemo(() => {
    const artists = new Set<string>();
    let fav = 0;
    let voca = 0;
    for (const t of activeTracks) {
      artists.add(t.artist);
      if (t.isFavorite) fav++;
      if (t.genre === 'ボカロ・VOCALOID' || t.genre === '歌ってみた・Cover') voca++;
    }
    return { artists: artists.size, fav, voca };
  }, [activeTracks]);

  const rows: { route: LibRoute; label: string; icon: React.ReactNode; count: number }[] = [
    { route: 'playlists', label: 'プレイリスト', icon: <ListMusic className="w-[22px] h-[22px]" />, count: playlists.length },
    { route: 'artists', label: 'アーティスト', icon: <Mic2 className="w-[22px] h-[22px]" />, count: counts.artists },
    { route: 'all', label: '曲', icon: <Music className="w-[22px] h-[22px]" />, count: musicTracks.length },
    { route: 'vocaloid', label: 'ボカロ・歌ってみた', icon: <Disc3 className="w-[22px] h-[22px]" />, count: counts.voca },
    { route: 'bgm', label: 'BGM', icon: <Headphones className="w-[22px] h-[22px]" />, count: bgmTracks.length },
    { route: 'history', label: '再生履歴', icon: <History className="w-[22px] h-[22px]" />, count: 0 },
    { route: 'yearReview', label: '年間まとめ', icon: <CalendarDays className="w-[22px] h-[22px]" />, count: 0 },
    { route: 'favorites', label: 'お気に入りの曲', icon: <Heart className="w-[22px] h-[22px]" />, count: counts.fav },
    { route: 'favArtists', label: 'お気に入りのアーティスト', icon: <Star className="w-[22px] h-[22px]" />, count: favoriteArtists.length },
  ];

  // 最近追加した項目: 初めて再生した日が新しい順
  const recent = useMemo(() => {
    return [...activeTracks]
      .sort((a, b) => String(b.firstPlayed || b.lastPlayed).localeCompare(String(a.firstPlayed || a.lastPlayed)))
      .slice(0, 6);
  }, [activeTracks]);

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="ライブラリ" />

      <div className="mt-1">
        {rows.map((r) => (
          <button
            key={r.route}
            onClick={() => navLib(r.route)}
            className="w-full flex items-center gap-4 text-left active:opacity-60 transition-opacity"
          >
            <span className="w-7 flex justify-center text-accent shrink-0">{r.icon}</span>
            <span className="flex-1 min-w-0 flex items-center py-3.5 mt-hairline">
              <span className="flex-1 text-[17px] text-fg truncate">{r.label}</span>
              <span className="text-[15px] text-muted mr-1">{r.count > 0 ? r.count : ''}</span>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </span>
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[22px] font-bold text-fg mb-3">最近追加した項目</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {recent.map((t) => {
              const album = artworkSource === 'album' ? albumArtFor(t.id) : null;
              return (
                <button key={t.id} onClick={() => playTrack(t, recent)} className="text-left active:opacity-70 transition-opacity min-w-0">
                  <div className="aspect-square rounded-[10px] overflow-hidden bg-surface-2 shadow-lg shadow-black/30">
                    <img
                      src={album ? album.url : `https://img.youtube.com/vi/${t.id}/mqdefault.jpg`}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[14px] font-semibold text-fg truncate mt-2">{t.title}</p>
                  <p className="text-[13px] text-muted truncate">{t.artist}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
