import React, { useMemo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import type { ChartsData } from '../utils/charts';
import { ChartCard } from './ChartCard';

interface ChartsShelfProps {
  charts: ChartsData | null;
  /** 「あなたへのおすすめ」で表示済みの曲（二重に出さない） */
  excludeIds?: Set<string>;
}

/** ホームの「人気の音楽（日本）」の棚。charts.json が無い・古い場合は何も表示しない。 */
export const ChartsShelf: React.FC<ChartsShelfProps> = ({ charts, excludeIds }) => {
  const { tracks } = usePlayer();
  const inLibrary = useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);

  if (!charts) return null;

  // 順位は元のチャートのまま表示する
  const shown = charts.tracks
    .map((track, idx) => ({ track, rank: idx + 1 }))
    .filter(({ track }) => !excludeIds?.has(track.id));
  if (shown.length === 0) return null;

  const d = new Date(charts.generatedAt);
  const updated = `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h3 className="text-lg font-bold text-fg tracking-tight">人気の音楽（日本）</h3>
        <p className="text-xs text-muted">YouTubeの人気動画（音楽）· {updated} 更新</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {shown.map(({ track, rank }) => (
          <ChartCard key={track.id} track={track} queue={charts.tracks} rank={rank} inLibrary={inLibrary.has(track.id)} />
        ))}
      </div>
    </section>
  );
};
