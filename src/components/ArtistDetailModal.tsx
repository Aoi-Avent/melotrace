import React, { useMemo } from 'react';
import {
  X,
  Play,
  Shuffle,
  Heart,
  ExternalLink,
  Ban,
  Music2,
  Clock,
  Sparkles,
  ChevronDown,
  Star,
} from 'lucide-react';
import { MusicTrack } from '../types/music';
import { usePlayer } from '../context/PlayerContext';

interface ArtistDetailModalProps {
  artistName: string | null;
  onClose: () => void;
}

export const ArtistDetailModal: React.FC<ArtistDetailModalProps> = ({
  artistName,
  onClose,
}) => {
  const {
    activeTracks,
    currentTrack,
    isPlaying,
    playTrack,
    setIsShuffle,
    toggleFavorite,
    banArtist,
    favoriteArtists,
    toggleFavoriteArtist,
  } = usePlayer();

  const artistTracks = useMemo(() => {
    if (!artistName) return [];
    const normalizedTarget = artistName.replace(/\s*\(Cover\)/i, '').trim().toLowerCase();

    return activeTracks.filter((t) => {
      const a = t.artist.replace(/\s*\(Cover\)/i, '').trim().toLowerCase();
      return a === normalizedTarget || t.artist.toLowerCase().includes(normalizedTarget);
    });
  }, [activeTracks, artistName]);

  const sortedTracks = useMemo(() => {
    return [...artistTracks].sort((a, b) => b.playCount - a.playCount);
  }, [artistTracks]);

  const totalPlays = useMemo(() => {
    return artistTracks.reduce((acc, t) => acc + t.playCount, 0);
  }, [artistTracks]);

  if (!artistName) return null;
  const isFavArtist = favoriteArtists.includes(artistName);

  const topTrack = sortedTracks[0];
  const representativeThumbnail =
    topTrack?.thumbnailUrl ||
    (topTrack?.id ? `https://img.youtube.com/vi/${topTrack.id}/hqdefault.jpg` : '');

  const formatDuration = (sec?: number | null) => {
    if (!sec || isNaN(sec)) return '3:30';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlayAll = (shuffle: boolean) => {
    if (sortedTracks.length === 0) return;
    setIsShuffle(shuffle);
    if (shuffle) {
      const randIdx = Math.floor(Math.random() * sortedTracks.length);
      playTrack(sortedTracks[randIdx], sortedTracks);
    } else {
      playTrack(sortedTracks[0], sortedTracks);
    }
  };

  const handleBan = () => {
    if (window.confirm(`「${artistName}」をライブラリから除外（非表示）にしますか？\n設定画面からいつでも解除できます。`)) {
      banArtist(artistName);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-in fade-in slide-in-from-right-8 duration-300">
      {/* Background backdrop blur */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {representativeThumbnail && (
          <img
            src={representativeThumbnail}
            alt=""
            className="w-full h-full object-cover mt-focus scale-150 blur-3xl opacity-20"
          />
        )}
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto h-full flex flex-col overflow-hidden">
        {/* 戻るボタン（ガラスの丸） */}
        <div className="absolute z-20 left-4 right-4 flex items-center justify-between" style={{ top: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
          <button
            onClick={onClose}
            aria-label="戻る"
            className="lg-glass w-10 h-10 rounded-full flex items-center justify-center text-fg active:scale-90 transition-transform"
          >
            <ChevronDown className="w-5 h-5 rotate-90" />
          </button>
          <button
            onClick={() => toggleFavoriteArtist(artistName)}
            aria-label={isFavArtist ? 'お気に入りのアーティストを解除' : 'お気に入りのアーティストに追加'}
            className={`lg-glass w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform ${isFavArtist ? 'text-accent' : 'text-fg'}`}
          >
            <Star key={String(isFavArtist)} className={`w-[18px] h-[18px] ${isFavArtist ? 'fill-current mt-pop' : ''}`} />
          </button>
        </div>

        {/* Scrollable Artist Catalog Content */}
        <div className="overflow-y-auto px-5 pt-0 pb-16 flex-1 ios-scroll-container">
          {/* アーティストのヒーロー（大きな画像・名前・再生） */}
          <div className="relative -mx-5 mb-6 h-[340px] overflow-hidden">
            {representativeThumbnail ? (
              <img src={representativeThumbnail} alt={artistName} className="absolute inset-0 w-full h-full object-cover mt-focus" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
                <Music2 className="w-16 h-16 text-fg/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
            <div className="absolute left-5 right-5 bottom-4">
              <h2 className="mt-large-title text-white break-words">{artistName}</h2>
              <p className="text-[13px] text-white/70 mt-1">
                {artistTracks.length}曲 収録 • 合計 {totalPlays} 回再生
              </p>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => handlePlayAll(false)}
                  aria-label="すべて再生"
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                >
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </button>
                <button
                  onClick={() => handlePlayAll(true)}
                  className="h-11 px-5 rounded-full lg-glass text-fg text-[15px] font-semibold flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Shuffle className="w-4 h-4" />
                  <span>シャッフル</span>
                </button>
              </div>
            </div>
          </div>

          {/* Song List */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[22px] font-bold text-fg tracking-tight">
                トップソング ({artistTracks.length})
              </h3>
              <span className="text-[11px] text-muted">再生回数順</span>
            </div>

            <div className="divide-y divide-fg/5 mt-stagger">
              {sortedTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    onClick={() => playTrack(track, sortedTracks)}
                    className={`flex items-center justify-between py-2.5 px-2 rounded-xl cursor-pointer active:bg-fg/10 transition-colors ${
                      isCurrent ? 'bg-fg/10' : 'hover:bg-fg/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-muted w-4 text-center tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-surface-2 relative border border-fg/10">
                        <img
                          src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
                          alt=""
                          className="w-full h-full object-cover mt-focus"
                        />
                        {isCurrent && isPlaying && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
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
                        <p className="text-[11px] text-muted truncate mt-0.5">
                          再生 {track.playCount}回 • {formatDuration(track.duration)}
                        </p>
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
            </div>
          </div>

          {/* Artist Management Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-fg/10">
            {topTrack?.id && (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(artistName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-3 rounded-xl bg-fg/5 hover:bg-fg/10 text-fg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-muted" />
                <span>YouTubeで「{artistName}」を検索・開く</span>
              </a>
            )}

            <button
              onClick={handleBan}
              className="w-full py-2.5 px-3 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>このアーティストを非表示 (Ban) にする</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
