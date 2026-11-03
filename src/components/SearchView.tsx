import React, { useState, useMemo } from 'react';
import {
  Search as SearchIcon,
  X,
  Play,
  Heart,
  Music2,
  Sparkles,
  Flame,
  ArrowRight,
  Disc3,
  User,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { MusicTrack } from '../types/music';
import { PageHeader } from './PageHeader';
import { YoutubeSearchResults } from './YoutubeSearchResults';

// 「カテゴリを見る」のタイルの色（ミュージックの検索画面のような、はっきりした色）
const TILE_GRADIENTS = [
  'linear-gradient(135deg, #f0405a, #c4223d)',
  'linear-gradient(135deg, #7b6cf0, #4a3fc4)',
  'linear-gradient(135deg, #2fc48d, #1b8f6a)',
  'linear-gradient(135deg, #f5a03a, #d2691e)',
  'linear-gradient(135deg, #c15cf0, #8a2fc4)',
  'linear-gradient(135deg, #34b5dc, #1f7fb0)',
];

interface SearchViewProps {
  onSelectArtist: (artist: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onSelectArtist }) => {
  const { activeTracks, currentTrack, isPlaying, playTrack, toggleFavorite } = usePlayer();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [visibleSearchCount, setVisibleSearchCount] = useState(50);

  const categories = [
    { label: 'ボカロ・VOCALOID', filter: 'ボカロ' },
    { label: '歌ってみた・Cover', filter: '歌ってみた' },
    { label: 'J-POP', filter: 'J-POP' },
    { label: 'ロック・バンド', filter: 'ロック' },
    { label: '作業用・BGM', filter: 'BGM' },
    { label: 'シティポップ', filter: 'シティポップ' },
  ];

  // Group artists with count
  const allArtists = useMemo(() => {
    const map = new Map<string, { count: number; topTrack: MusicTrack }>();
    activeTracks.forEach((t) => {
      const existing = map.get(t.artist);
      if (!existing) {
        map.set(t.artist, { count: 1, topTrack: t });
      } else {
        existing.count += 1;
        if (t.playCount > existing.topTrack.playCount) {
          existing.topTrack = t;
        }
      }
    });

    return Array.from(map.entries()).map(([artist, { count, topTrack }]) => ({
      artist,
      count,
      topTrack,
    }));
  }, [activeTracks]);

  // Filtered tracks
  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed && !selectedCategory) return [];

    return activeTracks.filter((track) => {
      if (selectedCategory) {
        const matchesCategory =
          track.genre.toLowerCase().includes(selectedCategory.toLowerCase()) ||
          `${track.title} ${track.artist}`.toLowerCase().includes(selectedCategory.toLowerCase());
        if (!matchesCategory) return false;
      }

      if (!trimmed) return true;

      const titleMatch = track.title.toLowerCase().includes(trimmed);
      const artistMatch = track.artist.toLowerCase().includes(trimmed);
      const genreMatch = track.genre.toLowerCase().includes(trimmed);
      return titleMatch || artistMatch || genreMatch;
    });
  }, [activeTracks, query, selectedCategory]);

  // Matching artists
  const matchingArtists = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    return allArtists
      .filter((item) => item.artist.toLowerCase().includes(trimmed))
      .slice(0, 4);
  }, [allArtists, query]);

  const topMatchingArtist = matchingArtists[0];

  const formatDuration = (sec?: number | null) => {
    if (!sec || isNaN(sec)) return '3:30';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="検索" />

      {/* 検索欄 */}
      <div className="mb-4 relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <SearchIcon className="h-[18px] w-[18px] text-muted" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="曲名、アーティスト、ボカロP、ジャンル"
          className="w-full pl-11 pr-10 py-3 rounded-full mt-soft text-fg text-[16px] placeholder-[#8e8e93] focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted hover:text-fg">
            <div className="w-5 h-5 rounded-full bg-fg/20 flex items-center justify-center">
              <X className="w-3 h-3 text-fg" />
            </div>
          </button>
        )}
      </div>

      {/* 絞り込みピル（検索中・カテゴリ選択中だけ） */}
      {(query.trim().length > 0 || selectedCategory) && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.filter;
            return (
              <button
                key={cat.filter}
                onClick={() => {
                  setSelectedCategory(isSelected ? null : cat.filter);
                }}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  isSelected ? 'bg-accent text-on-accent' : 'mt-soft text-fg/85'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      )}

      {/* SEARCH RESULTS VIEW */}
      {query.trim().length > 0 || selectedCategory ? (
        <div className="mt-4">
          {/* Top Result Card (Artist or Song) */}
          {topMatchingArtist && (
            <div className="mb-5 p-4 rounded-2xl apple-card border border-fg/10 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                  トップアーティスト
                </span>
                <button
                  onClick={() => onSelectArtist(topMatchingArtist.artist)}
                  className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline"
                >
                  <span>曲一覧・詳細</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div
                onClick={() => onSelectArtist(topMatchingArtist.artist)}
                className="flex items-center gap-3.5 cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border border-fg/20 shadow-lg bg-surface-2">
                  <img
                    src={`https://img.youtube.com/vi/${topMatchingArtist.topTrack.id}/mqdefault.jpg`}
                    alt=""
                    className="w-full h-full object-cover mt-focus"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-fg truncate">
                    {topMatchingArtist.artist}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    ライブラリ収録: {topMatchingArtist.count}曲
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const filtered = activeTracks.filter(
                      (t) => t.artist === topMatchingArtist.artist
                    );
                    if (filtered[0]) playTrack(filtered[0], filtered);
                  }}
                  className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-on-accent shadow-lg active:scale-95 shrink-0"
                >
                  <Play className="w-4 h-4 fill-white ml-0.5" />
                </button>
              </div>
            </div>
          )}

          {/* Matching Songs List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-fg tracking-tight">
                曲 ({searchResults.length})
              </h2>
            </div>

            {searchResults.length === 0 ? (
              <div className="py-12 text-center text-muted">
                <Music2 className="w-10 h-10 mx-auto text-fg/20 mb-2" />
                <p className="text-sm font-semibold text-fg">該当する曲が見つかりません</p>
                <p className="text-xs mt-1">別のキーワードやひらがな・英字でお試しください</p>
              </div>
            ) : (
              <div className="divide-y divide-fg/5">
                {searchResults.slice(0, visibleSearchCount).map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track, searchResults)}
                      className={`flex items-center justify-between py-2.5 px-2 rounded-xl cursor-pointer active:bg-fg/10 transition-colors ${
                        isCurrent ? 'bg-fg/10' : 'hover:bg-fg/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-2 relative border border-fg/10">
                          <img
                            src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                            alt=""
                            className="w-full h-full object-cover mt-focus"
                          />
                          {isCurrent && isPlaying && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-semibold truncate ${
                              isCurrent ? 'text-accent' : 'text-fg'
                            }`}
                          >
                            {track.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectArtist(track.artist);
                              }}
                              className="text-[11px] text-muted hover:text-accent truncate hover:underline"
                            >
                              {track.artist}
                            </span>
                            <span className="text-muted text-[9px]">•</span>
                            <span className="text-[10px] text-muted shrink-0">
                              {formatDuration(track.duration)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(track.id);
                        }}
                        className="p-2 text-muted hover:text-accent transition-colors shrink-0"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            track.isFavorite ? 'text-accent fill-accent' : 'stroke-[1.8]'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}

                {visibleSearchCount < searchResults.length && (
                  <div className="py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleSearchCount((prev) => prev + 50)}
                      className="px-4 py-2 rounded-full bg-fg/10 hover:bg-fg/15 text-fg text-xs font-semibold"
                    >
                      さらに曲を表示（残り {searchResults.length - visibleSearchCount} 件）
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* YouTube全体の検索（ボタンを押したときだけ。入力のたびには呼ばない） */}
          <YoutubeSearchResults query={query} centered={searchResults.length === 0} />
        </div>
      ) : (
        /* DEFAULT EMPTY SEARCH: EXPLORE ARTISTS & POPULAR GENRES */
        <div className="mt-2">
          <div className="mb-8">
            <h2 className="text-[22px] font-bold text-fg tracking-tight mb-3">カテゴリを見る</h2>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((cat, i) => (
                <button
                  key={cat.filter}
                  onClick={() => setSelectedCategory(cat.filter)}
                  className="relative aspect-[16/9] rounded-[14px] overflow-hidden text-left p-3 flex items-end active:scale-95 transition-transform"
                  style={{ background: TILE_GRADIENTS[i % TILE_GRADIENTS.length] }}
                >
                  <Disc3 className="absolute -right-3 -top-3 w-20 h-20 text-white/15" />
                  <span className="relative text-[17px] font-bold text-white leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-[22px] font-bold text-fg tracking-tight mb-3">
              人気のアーティスト
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {allArtists.slice(0, 6).map(({ artist, count, topTrack }) => (
                <div
                  key={artist}
                  onClick={() => onSelectArtist(artist)}
                  className="p-3 rounded-2xl apple-card border border-fg/5 hover:border-fg/15 cursor-pointer active:scale-98 transition-all flex items-center gap-2.5"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-surface-2 border border-fg/10">
                    <img
                      src={`https://img.youtube.com/vi/${topTrack.id}/mqdefault.jpg`}
                      alt=""
                      className="w-full h-full object-cover mt-focus"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fg truncate">{artist}</p>
                    <p className="text-[10px] text-muted">{count}曲</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-[22px] font-bold text-fg tracking-tight mb-3">
              最近再生された曲
            </h2>
            <div className="divide-y divide-fg/5">
              {activeTracks.slice(0, 5).map((track) => (
                <div
                  key={track.id}
                  onClick={() => playTrack(track)}
                  className="flex items-center justify-between py-2 px-1 rounded-xl cursor-pointer hover:bg-fg/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-2 border border-fg/10">
                      <img
                        src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                        alt=""
                        className="w-full h-full object-cover mt-focus"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">{track.title}</p>
                      <p className="text-[11px] text-muted truncate">{track.artist}</p>
                    </div>
                  </div>
                  <Play className="w-3.5 h-3.5 text-muted hover:text-fg shrink-0 mr-2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
