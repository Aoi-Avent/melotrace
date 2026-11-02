import React from 'react';
import { X, Search, Loader2, Trash2, Edit3 } from 'lucide-react';
import { MusicTrack } from '../types/music';
import { LrcLibTrack } from '../utils/lyricsService';
import { formatTime } from './nowPlayingHelpers';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

interface ManualLyricsModalProps {
  setShowManualLyricsModal: SetState<boolean>;
  handleSaveManualLyrics: (e: React.FormEvent) => void;
  manualLyricsInput: string;
  setManualLyricsInput: SetState<string>;
}

/** 歌詞の手動登録・編集モーダル */
export const ManualLyricsModal: React.FC<ManualLyricsModalProps> = ({
  setShowManualLyricsModal,
  handleSaveManualLyrics,
  manualLyricsInput,
  setManualLyricsInput,
}) => {
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl apple-card p-5 shadow-2xl border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-white">歌詞の手動登録・編集</h3>
          <button onClick={() => setShowManualLyricsModal(false)} className="text-[#8e8e93]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-[#8e8e93] mb-3">
          Webからコピーした歌詞テキストを貼り付けると、歌詞タブに反映されます。
        </p>
        <form onSubmit={handleSaveManualLyrics} className="flex flex-col gap-3">
          <textarea
            rows={8}
            value={manualLyricsInput}
            onChange={(e) => setManualLyricsInput(e.target.value)}
            placeholder="歌詞テキストをここに貼り付けてください..."
            className="w-full p-3 rounded-xl bg-[#2c2c2e] text-xs text-white placeholder-[#8e8e93] focus:outline-none focus:ring-1 focus:ring-accent"
            required
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowManualLyricsModal(false)}
              className="flex-1 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-accent text-on-accent text-xs font-bold"
            >
              保存する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface LyricsSearchModalProps {
  currentTrack: MusicTrack;
  setShowSearchModal: SetState<boolean>;
  setShowManualLyricsModal: SetState<boolean>;
  setCandidatesList: SetState<LrcLibTrack[]>;
  setHasSearchedCandidates: SetState<boolean>;
  handleCustomSearch: (e: React.FormEvent) => void;
  customSearchTitle: string;
  setCustomSearchTitle: SetState<string>;
  customSearchArtist: string;
  setCustomSearchArtist: SetState<string>;
  searchErrorMsg: string | null;
  setSearchErrorMsg: SetState<string | null>;
  isSearchingCandidates: boolean;
  isReSearching: boolean;
  candidatesList: LrcLibTrack[];
  hasSearchedCandidates: boolean;
  handleSelectCandidate: (candidate: LrcLibTrack) => void;
  handleClearLyrics: () => void;
}

/** 歌詞の検索・候補選択モーダル */
export const LyricsSearchModal: React.FC<LyricsSearchModalProps> = ({
  currentTrack,
  setShowSearchModal,
  setShowManualLyricsModal,
  setCandidatesList,
  setHasSearchedCandidates,
  handleCustomSearch,
  customSearchTitle,
  setCustomSearchTitle,
  customSearchArtist,
  setCustomSearchArtist,
  searchErrorMsg,
  setSearchErrorMsg,
  isSearchingCandidates,
  isReSearching,
  candidatesList,
  hasSearchedCandidates,
  handleSelectCandidate,
  handleClearLyrics,
}) => {
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl apple-card p-5 shadow-2xl border border-white/10 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-accent" />
            <h3 className="text-base font-bold text-white">歌詞の検索・候補選択</h3>
          </div>
          <button
            onClick={() => {
              setShowSearchModal(false);
              setCandidatesList([]);
              setHasSearchedCandidates(false);
            }}
            className="text-[#8e8e93] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-[#8e8e93] mb-3 shrink-0">
          曲名や原曲ボカロP・アーティスト名で検索し、正しい歌詞候補を選んで適用できます。
        </p>

        {/* Search Input Form */}
        <form onSubmit={handleCustomSearch} className="flex flex-col gap-2.5 shrink-0 mb-3">
          <div>
            <label className="text-[11px] font-semibold text-[#8e8e93] block mb-1">
              曲名
            </label>
            <input
              type="text"
              value={customSearchTitle}
              onChange={(e) => setCustomSearchTitle(e.target.value)}
              placeholder="例: 雨とペトラ, About me, 夜に駆ける"
              className="w-full px-3 py-2 rounded-xl bg-[#2c2c2e] text-xs text-white focus:outline-none focus:ring-1 focus:ring-accent"
              required
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[#8e8e93] block mb-1">
              原曲アーティスト / ボカロP (任意)
            </label>
            <input
              type="text"
              value={customSearchArtist}
              onChange={(e) => {
                setCustomSearchArtist(e.target.value);
                if (searchErrorMsg) setSearchErrorMsg(null);
              }}
              placeholder="例: バルーン, 蝶々P, YOASOBI"
              className="w-full px-3 py-2 rounded-xl bg-[#2c2c2e] text-xs text-white focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <button
            type="submit"
            disabled={isSearchingCandidates || isReSearching}
            className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-accent/20 disabled:opacity-50 mt-1"
          >
            {isSearchingCandidates || isReSearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>歌詞候補を検索中...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>候補を検索する</span>
              </>
            )}
          </button>
        </form>

        {/* Error or Info message */}
        {searchErrorMsg && (
          <div className="p-2.5 rounded-xl bg-accent/15 border border-accent/30 text-[#ff453a] text-[11px] leading-relaxed mb-3 shrink-0">
            {searchErrorMsg}
          </div>
        )}

        {/* Candidates Results List */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 flex flex-col gap-2 ios-scroll-container">
          {candidatesList.length > 0 && (
            <div className="flex items-center justify-between text-[11px] font-bold text-[#8e8e93] px-1 pb-1">
              <span>見つかった歌詞候補 ({candidatesList.length}件)</span>
              <span className="text-[10px] text-white/50">タップして適用</span>
            </div>
          )}

          {candidatesList.map((cand) => {
            const hasSynced = Boolean(cand.syncedLyrics);
            const hasPlain = Boolean(cand.plainLyrics);
            return (
              <div
                key={cand.id || Math.random()}
                className="p-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-accent/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-white truncate">
                      {cand.trackName || customSearchTitle}
                    </span>
                    {hasSynced ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#30d158]/20 text-[#30d158] shrink-0">
                        同期歌詞
                      </span>
                    ) : hasPlain ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#af52de]/20 text-[#af52de] shrink-0">
                        テキスト
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-[#8e8e93] truncate">
                    {cand.artistName || 'アーティスト名なし'}
                    {cand.albumName ? ` • ${cand.albumName}` : ''}
                  </p>
                  {cand.duration && (
                    <p className="text-[10px] text-white/40 mt-0.5">
                      曲長: {formatTime(cand.duration)}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectCandidate(cand)}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold shrink-0 transition-colors active:scale-95 shadow-md shadow-accent/20"
                >
                  適用
                </button>
              </div>
            );
          })}

          {hasSearchedCandidates && candidatesList.length === 0 && !isSearchingCandidates && !searchErrorMsg && (
            <div className="py-6 text-center text-xs text-[#8e8e93]">
              候補が見つかりませんでした。別のキーワードでお試しください。
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 shrink-0 mt-2">
          {currentTrack.lyrics ? (
            <button
              type="button"
              onClick={handleClearLyrics}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-accent/20 text-accent text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>歌詞をリセット（消去）</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowSearchModal(false);
                setShowManualLyricsModal(true);
              }}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#30d158]" />
              <span>手動で貼り付け</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowSearchModal(false);
              setCandidatesList([]);
              setHasSearchedCandidates(false);
            }}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
