import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { setVideoFullscreen } from '../utils/videoFullscreen';
import { usePlayerCoverInput, shouldCover } from '../utils/playerCover';

interface VideoOverlayProps {
  /** 埋め込みプレーヤーと同じ位置・大きさに重ねるための指定 */
  className: string;
  style?: React.CSSProperties;
  fullscreen: boolean;
}

/**
 * 動画表示モードで、埋め込みプレーヤーの上に重ねる層。
 * - 一時停止中は、YouTube標準の「タイトル・再生ボタン」の表示を隠して、サムネを出す
 * - 全画面中は、閉じる/再生・一時停止のボタンを出す（タップで表示/非表示）
 * - 広告中は、広告のスキップなどを押せるよう、何も覆わない
 */
export const VideoOverlay: React.FC<VideoOverlayProps> = ({ className, style, fullscreen }) => {
  const { currentTrack, isPlaying, isAdPlaying, togglePlay } = usePlayer();
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);
  const real = usePlayerCoverInput();

  const poke = () => {
    setShowControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    if (fullscreen) poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [fullscreen]);

  if (!currentTrack) return null;

  const covered = shouldCover(isPlaying, isAdPlaying, real.state, real.started, real.seeking);
  // 一時停止中は覆わず、止まった動画をそのまま見せる（再生ボタンだけ重ねる）
  const showPlayButton = (!isPlaying && !isAdPlaying) || covered;
  const controlsVisible = fullscreen && showControls && !isAdPlaying;

  return (
    <div className={`${className} pointer-events-none`} style={style}>
      <div
        className={`absolute inset-0 ${isAdPlaying ? 'pointer-events-none' : 'pointer-events-auto'}`}
        onClick={
          fullscreen
            ? () => {
                if (showControls) setShowControls(false);
                else poke();
              }
            : undefined
        }
      >
        {covered && (
          <>
            <img
              src={`https://i.ytimg.com/vi/${currentTrack.id}/mqdefault.jpg`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
        {(showPlayButton || controlsVisible) && (
          <button
            onClick={(e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              togglePlay();
              if (fullscreen) poke();
            }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-black/55 border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform"
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
          </button>
        )}
      </div>

      {fullscreen && (controlsVisible || isAdPlaying) && (
        <button
          onClick={() => setVideoFullscreen(false)}
          className="pointer-events-auto absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label="全画面を閉じる"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
