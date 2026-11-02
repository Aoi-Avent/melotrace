import React, { useMemo } from 'react';
import { Check, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useCharts } from '../utils/charts';

/** ホームの「人気の音楽（日本）」の棚。charts.json が無い・古い場合は何も表示しない。 */
export const ChartsShelf: React.FC = () => {
  const { tracks, currentTrack, isPlaying, playTrack, appendTracks } = usePlayer();
  const charts = useCharts();

  const inLibrary = useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);

  if (!charts) return null;

  const d = new Date(charts.generatedAt);
  const updated = `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h3 className="text-lg font-bold text-fg tracking-tight">人気の音楽（日本）</h3>
        <p className="text-xs text-muted">YouTubeの人気動画（音楽）· {updated} 更新</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {charts.tracks.map((track, idx) => {
          const added = inLibrary.has(track.id);
          return (
            <div key={track.id} className="w-32 shrink-0">
              <div
                onClick={() => playTrack(track, charts.tracks)}
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
                  <span className="absolute left-1.5 top-1.5 min-w-5 px-1 h-5 rounded-md bg-black/60 text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
                    {idx + 1}
                  </span>
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
        })}
      </div>
    </section>
  );
};
