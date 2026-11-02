import { PageHeader } from './PageHeader';
import React, { useMemo } from 'react';
import {
  TrendingUp,
  Clock,
  Flame,
  Play,
  Sparkles,
  Trophy,
  Compass,
  Headphones,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const AnalyticsView: React.FC = () => {
  const { activeTracks: tracks, playTrack, isDemoMode } = usePlayer();

  // Basic stats
  const totalPlays = useMemo(() => {
    return tracks.reduce((acc, t) => acc + t.playCount, 0);
  }, [tracks]);

  const estimatedHours = useMemo(() => {
    const totalSec = tracks.reduce((acc, t) => acc + (t.duration || 240) * t.playCount, 0);
    return Math.round((totalSec / 3600) * 10) / 10;
  }, [tracks]);

  // Top genres
  const genreStats = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((t) => {
      const g = t.genre || 'その他';
      map.set(g, (map.get(g) || 0) + t.playCount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([genre, count]) => ({
        genre,
        count,
        percent: totalPlays > 0 ? Math.round((count / totalPlays) * 100) : 0,
      }));
  }, [tracks, totalPlays]);

  // Top 10 repeat tracks
  const top10Tracks = useMemo(() => {
    return [...tracks].sort((a, b) => b.playCount - a.playCount).slice(0, 10);
  }, [tracks]);

  // Top 5 Artists
  const topArtists = useMemo(() => {
    const map = new Map<string, { count: number; songs: number }>();
    tracks.forEach((t) => {
      const current = map.get(t.artist) || { count: 0, songs: 0 };
      map.set(t.artist, {
        count: current.count + t.playCount,
        songs: current.songs + 1,
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([artist, data]) => ({ artist, ...data }));
  }, [tracks]);

  // Rediscover gems: high play count but not played recently
  const rediscoverTracks = useMemo(() => {
    const now = new Date().getTime();
    return [...tracks]
      .filter((t) => {
        if (t.playCount < 3 || !t.lastPlayed) return false;
        const last = new Date(t.lastPlayed).getTime();
        const daysDiff = (now - last) / (1000 * 60 * 60 * 24);
        return daysDiff >= 3 || isNaN(daysDiff);
      })
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 4);
  }, [tracks]);

  const genreColors: Record<string, string> = {
    'J-POP': '#0a84ff',
    'アニメ・ボカロ': '#af52de',
    'シティポップ': '#5ac8fa',
    'ロック・バンド': '#ff9500',
    '作業用・Lo-Fi': '#34c759',
    'カバー・歌ってみた': '#ff2d55',
    'その他': '#8e8e93',
  };

  return (
    <div className="ios-scroll-container pb-44 pt-2 px-5 max-w-lg mx-auto mt-stagger">
      <PageHeader title="履歴カルテ" onBack subtitle={isDemoMode ? 'サンプル視聴履歴' : 'あなたの視聴履歴データ'} />

      {/* Summary KPI Cards (Apple Music Replay style) */}
      <div className="grid grid-cols-3 gap-2.5 mb-6">
        <div className="p-3.5 rounded-2xl apple-card text-center">
          <span className="text-[11px] font-medium text-muted block mb-0.5">総楽曲数</span>
          <span className="text-2xl font-black text-fg tabular-nums">{tracks.length}</span>
          <span className="text-[10px] text-muted block">曲</span>
        </div>

        <div className="p-3.5 rounded-2xl apple-card text-center">
          <span className="text-[11px] font-medium text-muted block mb-0.5">累計再生</span>
          <span className="text-2xl font-black text-accent tabular-nums">{totalPlays}</span>
          <span className="text-[10px] text-muted block">回</span>
        </div>

        <div className="p-3.5 rounded-2xl apple-card text-center">
          <span className="text-[11px] font-medium text-muted block mb-0.5">総再生時間</span>
          <span className="text-2xl font-black text-fg tabular-nums">{estimatedHours}</span>
          <span className="text-[10px] text-muted block">時間</span>
        </div>
      </div>

      {/* Genre Breakdown */}
      <section className="mb-7 p-4 rounded-2xl apple-card">
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span>ジャンル構成比率</span>
        </h3>

        {/* Stacked Percentage Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-fg/10 mb-3">
          {genreStats.map((item) => (
            <div
              key={item.genre}
              style={{
                width: `${item.percent}%`,
                backgroundColor: genreColors[item.genre] || '#8e8e93',
              }}
              title={`${item.genre}: ${item.percent}%`}
              className="h-full transition-all duration-500"
            />
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {genreStats.map((item) => (
            <div key={item.genre} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.04]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: genreColors[item.genre] || '#8e8e93' }}
                />
                <span className="text-fg truncate font-medium">{item.genre}</span>
              </div>
              <span className="font-bold text-fg tabular-nums shrink-0">{item.percent}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Top 10 Repeated Songs */}
      <section className="mb-7">
        <h3 className="text-lg font-bold text-fg tracking-tight mb-3 flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-[#ffd60a]" />
          <span>最多リピート TOP 10</span>
        </h3>

        <div className="flex flex-col gap-1.5">
          {top10Tracks.map((track, idx) => (
            <div
              key={track.id}
              onClick={() => playTrack(track, top10Tracks)}
              className="flex items-center gap-3 p-2.5 rounded-xl apple-card hover:bg-white/[0.08] cursor-pointer active:scale-[0.99] transition-all"
            >
              <div className="w-6 text-center font-bold text-xs shrink-0 tabular-nums">
                {idx === 0 ? (
                  <span className="text-[#ffd60a] text-sm font-extrabold">1</span>
                ) : idx === 1 ? (
                  <span className="text-fg-soft text-sm font-extrabold">2</span>
                ) : idx === 2 ? (
                  <span className="text-[#ff9f0a] text-sm font-extrabold">3</span>
                ) : (
                  <span className="text-muted">{idx + 1}</span>
                )}
              </div>

              <img
                src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                alt={track.title}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-lg object-cover mt-thumb shrink-0 bg-surface-2"
                loading="lazy"
              />

              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-fg truncate leading-tight">
                  {track.title}
                </h4>
                <p className="text-[11px] text-muted truncate mt-0.5">
                  {track.artist}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-bold text-accent tabular-nums">{track.playCount}</span>
                <span className="text-[10px] text-muted block">回</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top Artists Leaderboard */}
      <section className="mb-7">
        <h3 className="text-lg font-bold text-fg tracking-tight mb-3 flex items-center gap-1.5">
          <Headphones className="w-4 h-4 text-[#bf5af2]" />
          <span>最愛アーティスト TOP 5</span>
        </h3>

        <div className="flex flex-col gap-2">
          {topArtists.map((artist, idx) => {
            const artistShare = totalPlays > 0 ? Math.round((artist.count / totalPlays) * 100) : 0;
            return (
              <div key={artist.artist} className="p-3 rounded-xl apple-card">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted tabular-nums">#{idx + 1}</span>
                    <h4 className="text-xs font-bold text-fg">{artist.artist}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-fg tabular-nums">{artist.count}回</span>
                    <span className="text-[10px] text-muted ml-1.5 tabular-nums">({artistShare}%)</span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-fg/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-[#bf5af2] rounded-full"
                    style={{ width: `${Math.min(100, artistShare * 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rediscover Buried Gems */}
      {rediscoverTracks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-fg tracking-tight flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[#30d158]" />
              <span>ご無沙汰の名曲</span>
            </h3>
          </div>
          <p className="text-[11px] text-muted mb-3 leading-relaxed">
            以前よく聴いていたのに、最近再生されていないお気に入りの曲です。
          </p>

          <div className="flex flex-col gap-2">
            {rediscoverTracks.map((track) => (
              <div
                key={track.id}
                onClick={() => playTrack(track)}
                className="flex items-center gap-3 p-2.5 rounded-xl apple-card hover:bg-white/[0.08] cursor-pointer active:scale-[0.99] transition-all"
              >
                <img
                  src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-lg object-cover mt-thumb shrink-0 bg-surface-2"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-fg truncate leading-tight">
                    {track.title}
                  </h4>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {track.artist} · 過去{track.playCount}回
                  </p>
                </div>
                <button
                  className="px-3 py-1 rounded-full bg-[#30d158]/20 text-[#30d158] text-[11px] font-bold hover:bg-[#30d158]/30 flex items-center gap-1"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>聴く</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
