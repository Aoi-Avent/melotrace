import React, { useState } from 'react';
import { searchChannels, useYoutubeApiKeySource, YoutubeApiError, type YtChannelHit } from '../utils/youtubeApi';
import type { ArtistChannel } from '../utils/artistChannels';

interface Props {
  name: string;
  onPick: (ch: ArtistChannel) => void;
}

/**
 * 未連携アーティストの「チャンネルを検索」。押したときだけ search.list を呼ぶ。
 * API消費の見積もり: 1回 100ユニット（同じ名前は24時間キャッシュで 0ユニット）。自分のAPIキーのときだけ表示する。
 */
export const ArtistChannelSearch: React.FC<Props> = ({ name, onPick }) => {
  const source = useYoutubeApiKeySource();
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<YtChannelHit[] | null>(null);
  const [error, setError] = useState('');

  if (source !== 'user') return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setHits(await searchChannels(name));
    } catch (e) {
      setError(e instanceof YoutubeApiError ? e.message : '検索できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5">
      {!hits && (
        <button onClick={run} disabled={busy} className="text-[11px] text-accent font-semibold underline underline-offset-2 disabled:opacity-50">
          {busy ? '検索中…' : 'チャンネルを検索（約100ユニット）'}
        </button>
      )}
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
      {hits && hits.length === 0 && <p className="text-[11px] text-muted">チャンネルが見つかりませんでした。</p>}
      {hits && hits.length > 0 && (
        <div className="space-y-1.5 mt-1">
          {hits.map((h) => (
            <div key={h.id} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-fg/10 shrink-0">
                {h.thumbnail && <img src={h.thumbnail} alt="" className="w-full h-full object-cover" />}
              </div>
              <span className="flex-1 min-w-0 text-xs truncate">{h.title}</span>
              <button
                onClick={() => onPick({ channelId: h.id, title: h.title || name })}
                className="px-3 py-1 rounded-lg bg-fg/10 text-accent text-xs font-semibold"
              >
                選ぶ
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
