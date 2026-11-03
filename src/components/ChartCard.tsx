import React from 'react';
import { Check, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { MusicTrack } from '../types/music';

interface ChartCardProps {
  track: MusicTrack;
  /** 再生キュー（タップで、この並びで再生する） */
  queue: MusicTrack[];
  /** 左上に出す順位（省略可） */
  rank?: number;
  inLibrary: boolean;
}

/** チャート系の棚で使う、サムネイル・再生・「ライブラリに追加」のカード */
export const ChartCard: React.FC<ChartCardProps> = ({ track, queue, rank, inLibrary }) => {
  const { currentTrack, isPlaying, playTrack, appendTracks } = usePlayer();
  const added = inLibrary;

  return (
    <div className="w-32 shrink-0">
      <div
        onClick={() => playTrack(track, queue)}
        className="cursor-pointer group active:scale-95 transition-transform"
      >
        <div className="w-32 h-32 rounded-xl overflow-hidden relative mb-2 bg-surface border border-fg/10 shadow-md">
          <img
            src={`https://img.youtube.com/vi/${track.id}/mqdefault.jpg`}
            alt={track.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
          {rank !== undefined && (
            <span className="absolute left-1.5 top-1.5 min-w-5 px-1 h-5 rounded-md bg-black/60 text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
              {rank}
            </span>
          )}
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
        <h4 className="text-xs font-semibold text-fg truncate leading-tight">{track.title}</h4>
        <p className="text-[11px] text-muted truncate mt-0.5">{track.artist}</p>
      </div>

      <button
        onClick={() => {
          const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
          appendTracks([{ ...track, lastPlayed: now, firstPlayed: now }]);
        }}
        disabled={added}
        className={`mt-1.5 w-full py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
          added ? 'bg-fg/5 text-muted' : 'bg-fg/10 text-accent hover:bg-fg/15 active:scale-95'
        }`}
        aria-label={added ? 'ライブラリに追加済み' : 'ライブラリに追加'}
      >
        {added ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        <span>{added ? '追加済み' : 'ライブラリに追加'}</span>
      </button>
    </div>
  );
};
