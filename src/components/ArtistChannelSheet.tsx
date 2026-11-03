import React, { useState } from 'react';
import { X } from 'lucide-react';
import { resolveChannelInput, type ArtistChannel } from '../utils/artistChannels';
import { ArtistChannelSearch } from './ArtistChannelSearch';

interface ArtistChannelSheetProps {
  unresolved: string[];
  onLink: (name: string, ch: ArtistChannel) => void;
  onClose: () => void;
}

/** チャンネル未連携のお気に入りアーティストの一覧。チャンネルのURL（または @ハンドル）を貼って連携する */
export const ArtistChannelSheet: React.FC<ArtistChannelSheetProps> = ({ unresolved, onLink, onClose }) => {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (name: string) => {
    const raw = (inputs[name] || '').trim();
    if (!raw || busy) return;
    setBusy(name);
    setErrors((e) => ({ ...e, [name]: '' }));
    try {
      const ch = await resolveChannelInput(raw, name);
      onLink(name, ch);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [name]: e instanceof Error ? e.message : '連携できませんでした。' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-app text-fg rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-bold">チャンネル未連携のアーティスト</h3>
          <button onClick={onClose} className="p-1 -m-1 text-muted" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted mb-4">YouTubeのチャンネルURL（または @ハンドル）を貼ると、新曲が「新着」に出ます。</p>

        {unresolved.length === 0 && <p className="text-sm text-muted py-6 text-center">すべて連携済みです。</p>}

        <div className="space-y-4">
          {unresolved.map((name) => (
            <div key={name}>
              <p className="text-sm font-semibold truncate mb-1.5">{name}</p>
              <div className="flex gap-2">
                <input
                  value={inputs[name] || ''}
                  onChange={(e) => setInputs((p) => ({ ...p, [name]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit(name);
                  }}
                  placeholder="チャンネルURLを貼る"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-fg/10 text-sm outline-none"
                />
                <button
                  onClick={() => submit(name)}
                  disabled={!!busy || !(inputs[name] || '').trim()}
                  className="px-3 py-2 rounded-lg bg-fg/10 text-accent text-sm font-semibold disabled:opacity-40"
                >
                  {busy === name ? '確認中…' : '連携'}
                </button>
              </div>
              {errors[name] && <p className="text-[11px] text-red-400 mt-1">{errors[name]}</p>}
              <ArtistChannelSearch name={name} onPick={(ch) => onLink(name, ch)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
