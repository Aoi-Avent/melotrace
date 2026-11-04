import React, { useState } from 'react';
import { Play, Pause, SkipForward, Disc3, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { WaitIndicator, WaitBar } from './WaitIndicator';
import { usePlayerTime } from '../utils/timeStore';

export const MiniPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    isAdPlaying,
    togglePlay,
    nextTrack,
    setIsNowPlayingOpen,
    setSelectedArtistForDetail,
    artworkSource,
    albumArtFor,
  } = usePlayer();
  const { currentTime, duration } = usePlayerTime();

  const [imgError, setImgError] = useState(false);

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const album = artworkSource === 'album' ? albumArtFor(currentTrack.id) : null;

  return (
    <div className="fixed bottom-[calc(3.75rem+max(env(safe-area-inset-bottom,0px),8px)+var(--bottom-gap,0px))] left-0 right-0 z-30 px-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div
        onClick={() => setIsNowPlayingOpen(true)}
        className="max-w-lg mx-auto relative overflow-hidden rounded-2xl apple-pill-miniplayer cursor-pointer active:scale-[0.985] transition-all"
      >
        <WaitBar />
        <div className="flex items-center gap-3 py-2 pl-2.5 pr-2">
          {/* Thumbnail */}
          <div className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surface-2 border border-fg/10 shadow-sm flex items-center justify-center">
            {!imgError ? (
              <img
                src={album ? album.url : `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`}
                alt={currentTrack.title}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover mt-focus"
                loading="lazy"
              />
            ) : (
              <Disc3 className={`w-6 h-6 text-accent ${isBuffering ? "animate-spin" : ""}`} />
            )}

            {/* Micro equalizing bar indicator when playing real music */}
            {isPlaying && !isAdPlaying && (
              <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center gap-[2px]">
                <span className="w-[2.5px] bg-fg rounded-full apple-eq-bar-1" />
                <span className="w-[2.5px] bg-fg rounded-full apple-eq-bar-2" />
                <span className="w-[2.5px] bg-fg rounded-full apple-eq-bar-3" />
              </div>
            )}
          </div>

          {/* Track metadata */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5 truncate">
              <h4 className="text-xs font-semibold text-fg truncate leading-tight tracking-tight">
                {currentTrack.title}
              </h4>
              <WaitIndicator compact className="shrink-0" />
            </div>
            <p
              onClick={(e) => {
                e.stopPropagation();
                setSelectedArtistForDetail(currentTrack.artist);
              }}
              className="text-[11px] text-muted hover:text-accent hover:underline truncate mt-0.5 cursor-pointer"
              title="アーティストの曲一覧を開く"
            >
              {currentTrack.artist}
            </p>
          </div>

          {/* iOS Apple Music Controls: Play/Pause and Next */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center text-fg hover:text-fg/80 active:scale-90 transition-transform"
              aria-label={isPlaying ? '一時停止' : '再生'}
            >
              {(isBuffering || isAdPlaying) && isPlaying ? (
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-fg active:scale-90 transition-colors"
              aria-label="次の曲"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>
        </div>

        {/* Subtle bottom progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-fg/10">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
