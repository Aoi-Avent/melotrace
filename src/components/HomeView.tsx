import { PageHeader } from './PageHeader';
import React, { useState, useMemo } from 'react';
import {
  Play,
  Shuffle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowDownToLine,
  Flame,
  Heart,
  Music2,
  Disc,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { ActiveTab, QuickMixItem } from '../types/music';
import { QUICK_MIXES } from '../data/quickMixes';
import { BackgroundPlayButton } from './BackgroundGuide';
import { ChartsShelf } from './ChartsShelf';
import { RecommendedShelf } from './RecommendedShelf';
import { useCharts, pickByArtists } from '../utils/charts';

interface HomeViewProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ setActiveTab }) => {
  const {
    activeTracks,
    musicTracks,
    bgmTracks,
    currentTrack,
    isPlaying,
    isDemoMode,
    favoriteArtists,
    playTrack,
    playBgmStation,
    togglePlay,
    loadDemoData,
    toggleFavorite,
    setIsShuffle,
    setSelectedArtistForDetail,
    setIsRetroPlayerOpen,
  } = usePlayer();

  const tracks = musicTracks.length > 0 ? musicTracks : activeTracks;
  const [isMixesExpanded, setIsMixesExpanded] = useState(false);

  // 「あなたへのおすすめ」: チャートのうち、選んだアーティストの曲（チャートの棚には同じ曲を出さない）
  const charts = useCharts();
  const recommended = useMemo(
    () => (charts ? pickByArtists(charts.tracks, favoriteArtists, 12) : []),
    [charts, favoriteArtists]
  );
  const recommendedIds = useMemo(() => new Set(recommended.map((t) => t.id)), [recommended]);
  const chartRanks = useMemo(
    () => new Map((charts?.tracks ?? []).map((t, i) => [t.id, i + 1] as [string, number])),
    [charts]
  );
  const chartsShelfVisible = !!charts && charts.tracks.some((t) => !recommendedIds.has(t.id));

  const totalPlays = useMemo(() => {
    return activeTracks.reduce((acc, t) => acc + t.playCount, 0);
  }, [activeTracks]);

  // Handle giant "とりあえず再生" - isolated from Free BGM / Classical!
  const handleBigPlay = () => {
    if (tracks.length === 0) {
      loadDemoData();
      return;
    }
    if (isPlaying) {
      togglePlay();
      return;
    }
    const randomIdx = Math.floor(Math.random() * tracks.length);
    setIsShuffle(true);
    playTrack(tracks[randomIdx], tracks);
  };

  // Play a quick mix - isolated from Free BGM / Classical
  const handleMixPlay = (mix: QuickMixItem) => {
    if (tracks.length === 0) {
      loadDemoData();
      return;
    }
    const filtered = mix.filterFn(tracks);
    const targetTracks = filtered.length > 0 ? filtered : tracks;
    setIsShuffle(true);
    const randomIdx = Math.floor(Math.random() * targetTracks.length);
    playTrack(targetTracks[randomIdx], targetTracks);
  };

  // Top repeated tracks
  const topTracks = useMemo(() => {
    return [...tracks].sort((a, b) => b.playCount - a.playCount).slice(0, 5);
  }, [tracks]);

  // Recent tracks
  const recentTracks = useMemo(() => {
    return [...tracks]
      .sort((a, b) => (b.lastPlayed || '').localeCompare(a.lastPlayed || ''))
      .slice(0, 10);
  }, [tracks]);

  // Top artists
  const topArtists = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((t) => map.set(t.artist, (map.get(t.artist) || 0) + t.playCount));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));
  }, [tracks]);

  const visibleMixes = isMixesExpanded ? QUICK_MIXES : QUICK_MIXES.slice(0, 6);

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="ホーム" />
      <div className="flex items-center justify-between pb-3">
        <span className="text-[13px] text-muted">
          {isDemoMode ? 'サンプル体験中' : `${tracks.length}曲 · 累計${totalPlays}回再生`}
        </span>
        {isDemoMode && (
          <button onClick={() => setActiveTab('import')} className="flex items-center gap-1 text-[13px] font-medium text-accent">
            <span>自分の履歴を取り込む</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Empty / Zero-state banner */}
      {tracks.length === 0 && (
        <div className="mb-6 p-6 rounded-2xl apple-card text-center border border-fg/10">
          <Sparkles className="w-10 h-10 text-accent mx-auto mb-3" />
          <h2 className="text-base font-bold text-fg mb-1">音楽データがありません</h2>
          <p className="text-xs text-muted mb-4 leading-relaxed">
            サンプルデータを読み込むか、Google Takeoutの履歴ファイルを取り込んで始めましょう。
            {chartsShelfVisible && (
              <>
                <br />
                下の人気の音楽から、気になる曲を追加して始められます
              </>
            )}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={loadDemoData}
              className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs active:scale-98 transition-all"
            >
              体験データをロードする
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className="w-full py-2.5 px-4 rounded-xl bg-fg/10 hover:bg-fg/15 text-fg-soft text-xs font-medium"
            >
              自分の履歴ファイルを読み込む
            </button>
          </div>
        </div>
      )}

      {/* HERO FEATURED BANNER (Apple Music Featured Station Style) */}
      {tracks.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/25 via-surface to-surface-2 border border-fg/10 p-5 mb-7 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>パーソナルステーション</span>
            </span>
            <span className="text-[11px] text-muted tabular-nums">
              {tracks.length}曲
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 pr-2">
              <h2 className="text-xl font-bold text-fg tracking-tight">
                とりあえずシャッフル再生
              </h2>
              <p className="text-xs text-[#a1a1a6] mt-1 line-clamp-2 leading-relaxed">
                あなたの全視聴履歴から、今一番聴きたい曲をランダムにミックスしてお届けします。
              </p>
            </div>

            <button
              onClick={handleBigPlay}
              className="w-14 h-14 rounded-full bg-accent hover:bg-accent-hover text-on-accent flex items-center justify-center shrink-0 shadow-[0_4px_20px_color-mix(in srgb, var(--accent) 45%, transparent)] active:scale-95 transition-all"
              aria-label="シャッフル再生"
            >
              {isPlaying ? (
                <div className="flex items-end gap-[3px] h-4">
                  <span className="w-1 bg-fg rounded-full apple-eq-bar-1" />
                  <span className="w-1 bg-fg rounded-full apple-eq-bar-2" />
                  <span className="w-1 bg-fg rounded-full apple-eq-bar-3" />
                </div>
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* 人気の音楽（日本）: charts.json が無ければ非表示 */}
      <RecommendedShelf tracks={recommended} ranks={chartRanks} />
      <ChartsShelf charts={charts} excludeIds={recommendedIds} />

      {/* QUICK MIXES (Expanded to 24 with pull-down toggle) */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-fg tracking-tight">
              クイックミックス
            </h3>
            <p className="text-xs text-muted">
              気分やシチュエーションに合わせて即再生
            </p>
          </div>
          <button
            onClick={() => setIsMixesExpanded(!isMixesExpanded)}
            className="flex items-center gap-1 text-xs text-accent font-semibold hover:underline"
          >
            <span>{isMixesExpanded ? '折りたたむ' : `全${QUICK_MIXES.length}種類`}</span>
            {isMixesExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 2-Column Mix Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {visibleMixes.map((mix) => (
            <button
              key={mix.id}
              onClick={() => handleMixPlay(mix)}
              className="p-3.5 rounded-2xl apple-card hover:bg-white/[0.08] active:scale-[0.98] transition-all text-left group flex flex-col justify-between min-h-[88px]"
            >
              <div>
                <span className="text-[10px] uppercase font-bold text-muted block mb-1">
                  {mix.category === 'mood'
                    ? '気分'
                    : mix.category === 'activity'
                    ? '行動'
                    : mix.category === 'genre'
                    ? 'ジャンル'
                    : '履歴'}
                </span>
                <h4 className="text-xs font-bold text-fg group-hover:text-accent transition-colors leading-snug">
                  {mix.title}
                </h4>
              </div>
              <p className="text-[10px] text-muted truncate mt-1">
                {mix.subtitle}
              </p>
            </button>
          ))}
        </div>

        {/* Bottom disclosure button to expand/collapse if not already */}
        <button
          onClick={() => setIsMixesExpanded(!isMixesExpanded)}
          className="w-full mt-3 py-2.5 rounded-xl bg-fg/5 hover:bg-fg/10 active:scale-98 text-xs font-semibold text-muted hover:text-fg transition-colors flex items-center justify-center gap-1.5"
        >
          <span>
            {isMixesExpanded
              ? '一部のミックスのみ表示'
              : `残りのミックスを表示 (${QUICK_MIXES.length - 6}種類)`}
          </span>
          {isMixesExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </section>

      {/* RECENTLY PLAYED (最近聴いた曲) Horizontal Shelf */}
      {recentTracks.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-fg tracking-tight">
              最近再生した曲
            </h3>
            <button
              onClick={() => setActiveTab('library')}
              className="text-xs text-accent font-semibold flex items-center gap-0.5 hover:underline"
            >
              <span>すべて見る</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
            {recentTracks.map((track) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, recentTracks)}
                className="w-32 shrink-0 cursor-pointer group active:scale-95 transition-transform"
              >
                <div className="w-32 h-32 rounded-xl overflow-hidden relative mb-2 bg-surface border border-fg/10 shadow-md">
                  <img
                    src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                    alt={track.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover mt-focus group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                  {currentTrack?.id === track.id && isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex items-end gap-[3px] h-4">
                        <span className="w-1 bg-accent rounded-full apple-eq-bar-1" />
                        <span className="w-1 bg-accent rounded-full apple-eq-bar-2" />
                        <span className="w-1 bg-accent rounded-full apple-eq-bar-3" />
                      </div>
                    </div>
                  )}
                </div>
                <h4 className="text-xs font-semibold text-fg truncate leading-tight">
                  {track.title}
                </h4>
                <p className="text-[11px] text-muted truncate mt-0.5">
                  {track.artist}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TOP 5 REPEATED TRACKS (ヘビロテ) */}
      {topTracks.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-fg tracking-tight">
              最多リピート TOP 5
            </h3>
            <button
              onClick={() => setActiveTab('analytics')}
              className="text-xs text-accent font-semibold flex items-center gap-0.5 hover:underline"
            >
              <span>カルテ</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {topTracks.map((track, idx) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, topTracks)}
                className="flex items-center gap-3 p-2.5 rounded-xl apple-card hover:bg-white/[0.08] cursor-pointer active:scale-[0.99] transition-all"
              >
                <span className="w-5 text-center font-bold text-xs text-muted tabular-nums shrink-0">
                  {idx + 1}
                </span>

                <img
                  src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-cover mt-thumb shrink-0 bg-surface-2"
                  loading="lazy"
                />

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-fg truncate leading-tight">
                    {track.title}
                  </h4>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {track.artist} · {track.playCount}回
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(track.id);
                  }}
                  className="p-2 text-muted hover:text-accent transition-colors"
                  aria-label="お気に入り"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      track.isFavorite ? 'text-accent fill-accent' : ''
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TOP ARTISTS */}
      {topArtists.length > 0 && (
        <section className="mb-4">
          <h3 className="text-lg font-bold text-fg tracking-tight mb-3">
            よく聴くアーティスト
          </h3>
          <div className="flex flex-wrap gap-2">
            {topArtists.map((artist) => (
              <button
                key={artist.name}
                onClick={() => setSelectedArtistForDetail(artist.name)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full apple-card hover:bg-white/[0.12] active:scale-95 transition-all text-xs text-fg"
                title="このアーティストの曲一覧を開く"
              >
                <span className="font-medium">{artist.name}</span>
                <span className="text-[10px] text-accent font-bold">
                  {artist.count}回
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
