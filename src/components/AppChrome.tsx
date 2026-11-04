import React, { useState } from 'react';
import { House, Radio, Library, Search, Play, Pause, FastForward, Loader2, Disc3 } from 'lucide-react';
import type { ActiveTab } from '../types/music';
import { usePlayer } from '../context/PlayerContext';
import { WaitIndicator } from './WaitIndicator';
import { useNav, navSetTab, parentTab, useCompactChrome } from '../utils/nav';

const TABS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'home', label: 'ホーム', icon: House },
  { id: 'radio', label: 'ラジオ', icon: Radio },
  { id: 'library', label: 'ライブラリ', icon: Library },
  { id: 'search', label: '検索', icon: Search },
];

/** 再生中の曲のカプセル（ミニプレイヤー） */
const MiniCapsule: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { currentTrack, isPlaying, isBuffering, isAdPlaying, togglePlay, nextTrack, setIsNowPlayingOpen, artworkSource, albumArtFor } = usePlayer();
  const [imgError, setImgError] = useState(false);
  if (!currentTrack) return null;
  const album = artworkSource === 'album' ? albumArtFor(currentTrack.id) : null;
  const busy = (isBuffering || isAdPlaying) && isPlaying;
  return (
    <div
      onClick={() => setIsNowPlayingOpen(true)}
      className={`lg-glass flex items-center gap-3 h-[54px] rounded-full pl-2 pr-2 cursor-pointer active:scale-[0.985] transition-transform ${compact ? 'flex-1 min-w-0' : ''}`}
    >
      <div className="w-[38px] h-[38px] rounded-full overflow-hidden shrink-0 bg-surface-2 flex items-center justify-center">
        {!imgError ? (
          <img
            src={album ? album.url : `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Disc3 className="w-5 h-5 text-accent" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-semibold text-fg truncate leading-tight">{currentTrack.title}</p>
          <WaitIndicator compact className="shrink-0" />
        </div>
        {!compact && <p className="text-[12px] text-muted truncate leading-tight mt-0.5">{currentTrack.artist}</p>}
        {compact && <p className="text-[11px] text-muted truncate leading-tight mt-0.5">{currentTrack.artist}</p>}
      </div>
      <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center text-fg active:scale-90 transition-transform" aria-label={isPlaying ? '一時停止' : '再生'}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin text-accent" /> : isPlaying ? <Pause className="w-[22px] h-[22px] fill-current" /> : <Play className="w-[22px] h-[22px] fill-current ml-0.5" />}
        </button>
        {!compact && (
          <button onClick={nextTrack} className="w-10 h-10 flex items-center justify-center text-fg active:scale-90 transition-transform" aria-label="次の曲">
            <FastForward className="w-[22px] h-[22px] fill-current" />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * 画面の下に浮かぶ、ガラスのタブバーとミニプレイヤー。
 * 画面を下へスクロールすると、「いまのタブ / ミニプレイヤー / 検索」の小さな1行にたたまれる。
 */
export const AppChrome: React.FC = () => {
  const nav = useNav();
  const compact = useCompactChrome();
  const { currentTrack } = usePlayer();
  const active = parentTab(nav);
  const activeDef = TABS.find((t) => t.id === active) || TABS[0];
  const ActiveIcon = activeDef.icon;
  const SearchIcon = Search;

  return (
    <div
      className="fixed left-0 right-0 z-40 px-3 pointer-events-none"
      style={{ bottom: 'calc(12px + var(--bottom-gap, 0px))' }}
    >
      <div className="max-w-lg mx-auto relative">
        {/* ふだんの形: ミニプレイヤーの下にタブバー */}
        <div
          className={`flex flex-col gap-2 transition-all duration-300 ease-out ${compact ? 'opacity-0 translate-y-3 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
        >
          {currentTrack && <MiniCapsule />}
          <nav className="lg-glass h-[64px] rounded-full flex items-center p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => navSetTab(t.id)}
                  className={`flex-1 h-full rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
                    isActive ? 'bg-black/45 text-accent' : 'text-fg'
                  }`}
                >
                  <Icon className="w-[24px] h-[24px]" strokeWidth={isActive ? 2.3 : 1.9} />
                  <span className="text-[10px] font-semibold tracking-tight">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* たたんだ形: 左にいまのタブ、まんなかにミニプレイヤー、右に検索 */}
        <div
          className={`absolute left-0 right-0 bottom-0 flex items-center gap-2 transition-all duration-300 ease-out ${
            compact ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
        >
          <button
            onClick={() => navSetTab(activeDef.id)}
            aria-label={activeDef.label}
            className="lg-glass w-[54px] h-[54px] rounded-full flex items-center justify-center text-accent shrink-0 active:scale-90 transition-transform"
          >
            <ActiveIcon className="w-[24px] h-[24px]" strokeWidth={2.3} />
          </button>
          {currentTrack ? <MiniCapsule compact /> : <div className="flex-1" />}
          <button
            onClick={() => navSetTab('search')}
            aria-label="検索"
            className={`lg-glass w-[54px] h-[54px] rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform ${
              active === 'search' ? 'text-accent' : 'text-fg'
            }`}
          >
            <SearchIcon className="w-[24px] h-[24px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
};
