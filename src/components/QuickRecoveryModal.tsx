import React, { useState } from 'react';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Database,
  Check,
  X,
  AlertTriangle,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { loadTracksFromDB } from '../utils/db';
import { useRecoveryOpen, openRecovery, closeRecovery } from '../utils/recoveryUi';

export const QuickRecoveryModal: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isPlayerMuted,
    unmuteAudio,
    resyncPlayer,
    activeTracks,
  } = usePlayer();

  const isOpen = useRecoveryOpen();
  const setIsOpen = (v: boolean) => (v ? openRecovery() : closeRecovery());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dbCount, setDbCount] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleResync = () => {
    resyncPlayer();
    showToast('プレイヤーを再同期し、音声を復旧しました');
  };

  const handleUnmute = () => {
    unmuteAudio();
    showToast('音声を最大音量で有効化しました');
  };

  const handleVerifyDB = async () => {
    const dbTracks = await loadTracksFromDB();
    const count = dbTracks ? dbTracks.length : 0;
    setDbCount(count);
    showToast(`IndexedDB内に ${count.toLocaleString()} 曲が正常に保管されています`);
  };

  return (
    <>
      {/* 右上: 音声が止まっているときだけ出るミュート解除ボタン（復旧は再生画面の「…」メニューへ移動） */}
      {isPlaying && isPlayerMuted && (
        <div className="fixed top-[max(env(safe-area-inset-top,0px),8px)] right-3 z-40 flex items-center gap-1.5">
          <button
            onClick={handleUnmute}
            className="px-2.5 py-1 rounded-full bg-amber-500/90 text-black text-[11px] font-bold flex items-center gap-1 shadow-lg shadow-amber-500/30 animate-pulse active:scale-95 transition-all"
            title="タップして音声を出す"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>音声を有効化</span>
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-2xl bg-fg/95 text-black text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-[#30d158] stroke-[3]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Recovery Modal Sheet */}
      {isOpen && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl apple-card p-5 shadow-2xl border border-fg/15 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-fg/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg">クイック診断・アプリ復旧</h3>
                  <p className="text-[10px] text-muted">ページを再読込せずに不具合を解消</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-fg active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {/* Option 1: Resync Player & Audio */}
              <button
                onClick={() => {
                  handleResync();
                  setIsOpen(false);
                }}
                className="w-full p-3 rounded-2xl bg-fg/5 hover:bg-fg/10 active:scale-98 text-left flex items-center gap-3 transition-all border border-fg/5"
              >
                <div className="w-9 h-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-fg">プレイヤーを再同期 (音が出ない時)</p>
                  <p className="text-[10px] text-muted truncate">
                    現在の秒数から動画と音声を再接続・復旧します
                  </p>
                </div>
              </button>

              {/* Option 2: Force Unmute */}
              <button
                onClick={() => {
                  handleUnmute();
                  setIsOpen(false);
                }}
                className="w-full p-3 rounded-2xl bg-fg/5 hover:bg-fg/10 active:scale-98 text-left flex items-center gap-3 transition-all border border-fg/5"
              >
                <div className="w-9 h-9 rounded-xl bg-[#30d158]/20 text-[#30d158] flex items-center justify-center shrink-0">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-fg">音声を強制有効化 (ミュート解除)</p>
                  <p className="text-[10px] text-muted truncate">
                    ブラウザの自動再生制限で音が消えた際に解除
                  </p>
                </div>
              </button>

              {/* Option 3: Verify Storage Data */}
              <button
                onClick={handleVerifyDB}
                className="w-full p-3 rounded-2xl bg-fg/5 hover:bg-fg/10 active:scale-98 text-left flex items-center gap-3 transition-all border border-fg/5"
              >
                <div className="w-9 h-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-fg">ライブラリ保存状況を確認</p>
                  <p className="text-[10px] text-muted truncate">
                    IndexedDB保管曲数: {dbCount !== null ? `${dbCount.toLocaleString()}曲` : `${activeTracks.length.toLocaleString()}曲 (クリックで再検証)`}
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-muted text-center pt-1 border-t border-fg/5">
              ※車 (CarPlay) やバックグラウンド再生時も本ボタンで即座に音声復旧できます
            </p>
          </div>
        </div>
      )}
    </>
  );
};
