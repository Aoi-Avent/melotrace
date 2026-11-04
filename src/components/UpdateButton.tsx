import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, checkForUpdate, CURRENT_BUILD_ID, startUpdateWatcher, useAppUpdate } from '../utils/appUpdate';

/** 新しいデプロイが見つかったときだけ、画面の左上に小さく出る「最新版に更新」。起動時に確認も始める。 */
export const UpdateBanner: React.FC = () => {
  const { status } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    startUpdateWatcher();
  }, []);

  if (status !== 'available' || dismissed) return null;
  return (
    <div className="fixed top-[max(env(safe-area-inset-top,0px),8px)] left-3 z-40 flex items-center rounded-full bg-accent text-on-accent shadow-lg animate-in fade-in">
      <button onClick={applyUpdate} className="pl-2.5 pr-1.5 py-1 flex items-center gap-1 text-[11px] font-bold active:scale-95 transition-transform">
        <RefreshCw className="w-3.5 h-3.5" />
        <span>最新版に更新</span>
      </button>
      <button onClick={() => setDismissed(true)} className="pr-2 pl-0.5 py-1 active:scale-90" aria-label="閉じる">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/** 設定画面の「アプリの更新」。押すと最新を確認し、新しければそのまま読み込み直す。 */
export const UpdateCard: React.FC = () => {
  const { status } = useAppUpdate();
  const [msg, setMsg] = useState<string | null>(null);

  const onTap = async () => {
    setMsg(null);
    const s = status === 'available' ? 'available' : await checkForUpdate();
    if (s === 'available') applyUpdate();
    else if (s === 'latest') setMsg('すでに最新です');
    else setMsg('確認できませんでした。通信を確認してもう一度お試しください');
  };

  return (
    <div className="mb-5 p-4 rounded-2xl apple-card border border-fg/10 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-fg">アプリの更新</h3>
        <p className="text-[11px] text-muted mt-0.5">
          {msg ?? (status === 'available' ? '新しいバージョンがあります' : `バージョン ${CURRENT_BUILD_ID.slice(0, 7)}`)}
        </p>
      </div>
      <button
        onClick={onTap}
        disabled={status === 'checking'}
        className="shrink-0 px-3 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
        <span>{status === 'available' ? '最新版に更新' : '最新版を確認'}</span>
      </button>
    </div>
  );
};
