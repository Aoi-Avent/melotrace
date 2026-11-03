import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Check } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useCharts } from '../utils/charts';
import { usePref, setPref } from '../utils/uiPrefs';
import { normalizeName } from '../utils/textMatch';
import { SEED_ARTISTS } from '../data/seedArtists';

export const PREF_ONBOARDING = 'melotrace_onboarding_v1'; // 未設定 | 'done'
const MIN_PICK = 3;
const MAX_CANDIDATES = 36;

// 設定画面から「条件に関係なく」開くための、小さなストア
let manualOpen = false;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const setManualOpen = (v: boolean) => {
  manualOpen = v;
  listeners.forEach((l) => l());
};
export const openArtistOnboarding = () => setManualOpen(true);

interface Candidate {
  name: string;
  /** チャート曲の動画ID（サムネイル用）。固定リストの候補には無い */
  videoId?: string;
}

function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

const Avatar: React.FC<{ c: Candidate }> = ({ c }) => {
  const [failed, setFailed] = useState(false);
  if (c.videoId && !failed) {
    return (
      <img
        src={`https://img.youtube.com/vi/${c.videoId}/mqdefault.jpg`}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <span
      className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
      style={{ background: `hsl(${hueOf(c.name)} 45% 38%)` }}
    >
      {(Array.from(c.name.trim())[0] || '?').toUpperCase()}
    </span>
  );
};

/** 初回だけ出る「好きなアーティストを選ぶ」画面。設定画面からはいつでも開き直せる */
export const ArtistOnboarding: React.FC = () => {
  const { tracks, favoriteArtists, isDemoMode, addFavoriteArtists } = usePlayer();
  const [done, setDone] = usePref(PREF_ONBOARDING, '');
  const manual = useSyncExternalStore(subscribe, () => manualOpen);

  const autoShow = done === '' && tracks.length === 0 && favoriteArtists.length === 0 && !isDemoMode;
  const open = manual || autoShow;

  if (!open) return null;
  return (
    <Sheet
      key={manual ? 'manual' : 'auto'}
      onClose={(names) => {
        if (names.length > 0) addFavoriteArtists(names);
        setDone('done');
        setManualOpen(false);
      }}
    />
  );
};

const Sheet: React.FC<{ onClose: (picked: string[]) => void }> = ({ onClose }) => {
  const { favoriteArtists } = usePlayer();
  const charts = useCharts();

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    const seen = new Set<string>();
    const add = (name: string, videoId?: string) => {
      const key = normalizeName(name);
      if (!key || seen.has(key) || out.length >= MAX_CANDIDATES) return;
      seen.add(key);
      out.push({ name, videoId });
    };
    charts?.tracks.forEach((t) => {
      if (t.artist) add(t.artist, t.id);
    });
    SEED_ARTISTS.forEach((n) => add(n));
    return out;
  }, [charts]);

  // 既にお気に入りの候補は、選択済みで固定（ここでは外さない）
  const locked = useMemo(() => {
    const fav = new Set(favoriteArtists.map((a) => normalizeName(a)));
    return new Set(candidates.filter((c) => fav.has(normalizeName(c.name))).map((c) => c.name));
  }, [candidates, favoriteArtists]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const count = new Set([...locked, ...picked]).size;
  const need = Math.max(0, MIN_PICK - count);

  const toggle = (name: string) => {
    if (locked.has(name)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-app text-fg flex flex-col mt-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="好きなアーティストを選ぶ"
    >
      <div className="w-full max-w-lg mx-auto flex flex-col h-full">
        <header className="px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+20px)] shrink-0">
          <h2 className="text-xl font-bold tracking-tight">好きなアーティストを選んでください</h2>
          <p className="text-xs text-muted mt-1">あとから変更できます</p>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          <div className="grid grid-cols-3 gap-x-3 gap-y-5">
            {candidates.map((c) => {
              const on = locked.has(c.name) || picked.has(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => toggle(c.name)}
                  aria-pressed={on}
                  className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
                >
                  <span
                    className={`relative block w-full max-w-[104px] aspect-square rounded-full border-[3px] transition-colors ${
                      on ? 'border-accent' : 'border-transparent'
                    } ${locked.has(c.name) ? 'opacity-70' : ''}`}
                  >
                    <span className="block w-full h-full rounded-full overflow-hidden bg-surface-2">
                      <Avatar c={c} />
                    </span>
                    {on && (
                      <span className="mt-pop absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-accent text-on-accent flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-semibold text-fg text-center leading-tight line-clamp-2 break-all">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="shrink-0 px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),16px)] border-t border-fg/10 bg-app">
          <button
            type="button"
            disabled={need > 0}
            onClick={() => onClose([...picked])}
            className={`w-full py-3.5 rounded-full text-sm font-semibold transition-all ${
              need > 0 ? 'bg-fg/10 text-muted' : 'bg-accent text-on-accent hover:bg-accent-hover active:scale-[0.98]'
            }`}
          >
            {need > 0 ? `あと${need}人` : `${count}人を選んで始める`}
          </button>
          <button
            type="button"
            onClick={() => onClose([])}
            className="block mx-auto mt-3 text-xs font-medium text-muted hover:text-fg"
          >
            スキップ
          </button>
        </footer>
      </div>
    </div>
  );
};
