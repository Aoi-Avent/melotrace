import React, { useMemo, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useCharts } from '../utils/charts';
import { useArtistChannels } from '../utils/artistChannels';
import { useNewReleases } from '../utils/newReleases';
import { ChartCard } from './ChartCard';
import { ArtistChannelSheet } from './ArtistChannelSheet';

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(days) || days <= 0) return '今日';
  if (days < 30) return `${days}日前`;
  return `${Math.floor(days / 30)}か月前`;
}

/** ホームの「新着」: お気に入りのアーティスト（チャンネル連携済み）の、直近の新曲。お気に入りが0人なら何も出さない */
export const NewReleasesShelf: React.FC = () => {
  const { tracks: library, favoriteArtists, strictnessMode } = usePlayer();
  const charts = useCharts();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { linked, unresolved, link } = useArtistChannels(favoriteArtists, library, charts?.tracks ?? []);
  const targets = useMemo(() => linked.map((l) => ({ channelId: l.channelId, name: l.name })), [linked]);
  const { tracks, error } = useNewReleases(targets, strictnessMode);
  const inLibrary = useMemo(() => new Set(library.map((t) => t.id)), [library]);

  if (favoriteArtists.length === 0) return null;

  return (
    <>
      {tracks.length > 0 && (
        <section className="mb-8">
          <div className="mb-3">
            <h3 className="text-lg font-bold text-fg tracking-tight">新着</h3>
            <p className="text-xs text-muted">お気に入りのアーティストの新曲</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
            {tracks.map((t) => (
              <ChartCard key={t.id} track={t} queue={tracks} subtitle={relativeDate(t.publishedAt)} inLibrary={inLibrary.has(t.id)} />
            ))}
          </div>
        </section>
      )}

      {tracks.length === 0 && error && <p className="text-xs text-muted mb-4">新着を取得できませんでした</p>}

      {unresolved.length > 0 && (
        <button onClick={() => setSheetOpen(true)} className="block text-[11px] text-muted underline underline-offset-2 mb-6">
          {unresolved.length}組はチャンネル未連携
        </button>
      )}

      {sheetOpen && <ArtistChannelSheet unresolved={unresolved} onLink={link} onClose={() => setSheetOpen(false)} />}
    </>
  );
};
