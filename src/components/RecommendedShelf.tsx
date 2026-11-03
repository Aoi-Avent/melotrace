import React, { useMemo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import type { MusicTrack } from '../types/music';
import { ChartCard } from './ChartCard';

interface RecommendedShelfProps {
  tracks: MusicTrack[];
  /** 元のチャートでの順位（曲ID → 順位） */
  ranks: Map<string, number>;
}

/** 「あなたへのおすすめ」: 選んだアーティストの、チャートの曲だけを並べる。1曲もなければ非表示 */
export const RecommendedShelf: React.FC<RecommendedShelfProps> = ({ tracks, ranks }) => {
  const { tracks: library } = usePlayer();
  const inLibrary = useMemo(() => new Set(library.map((t) => t.id)), [library]);

  if (tracks.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h3 className="text-lg font-bold text-fg tracking-tight">あなたへのおすすめ</h3>
        <p className="text-xs text-muted">選んだアーティストの人気の曲</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {tracks.map((track) => (
          <ChartCard key={track.id} track={track} queue={tracks} rank={ranks.get(track.id)} inLibrary={inLibrary.has(track.id)} />
        ))}
      </div>
    </section>
  );
};
