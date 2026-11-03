/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { AppChrome } from './components/AppChrome';
import { NowPlayingModal } from './components/NowPlayingModal';
import { ArtistOnboarding } from './components/ArtistOnboarding';
import { HomeView } from './components/HomeView';
import { RadioView } from './components/RadioView';
import { LibraryView } from './components/LibraryView';
import { AnalyticsView } from './components/AnalyticsView';
import { DataImportView } from './components/DataImportView';
import { ArtistsView } from './components/ArtistsView';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { LibraryRoot } from './components/LibraryRoot';
import { PlayHistoryView } from './components/PlayHistoryView';
import { usePreLogSnapshot } from './utils/preLogSnapshot';
import { useNav, navSetTab, navBack, installChromeScroll } from './utils/nav';
import { RetroPlayer } from './components/RetroPlayer';
import { BackgroundGuideModal } from './components/BackgroundGuide';
import { PlaybackToast } from './components/PlaybackToast';
import { Mascot } from './components/Mascot';
import { AdTip } from './components/AdTip';
import { isNativeApp } from './utils/platform';
import { usePref } from './utils/uiPrefs';
import { DesktopModeBanner } from './components/DesktopModeBanner';
import { SearchView } from './components/SearchView';
import { ArtistDetailModal } from './components/ArtistDetailModal';
import { QuickRecoveryModal } from './components/QuickRecoveryModal';
import { VideoOverlay } from './components/VideoOverlay';
import { useVideoFullscreen, setVideoFullscreen } from './utils/videoFullscreen';
import { ActiveTab } from './types/music';
import { scrollMem } from './utils/viewMemory';
import { initStatusBarScrollTop } from './utils/scrollTop';
import { initNoBounceScroll } from './utils/useNoBounce';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Crash intercepted by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('melotrace_last_track_id_v5');
    } catch (e) {}
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-app text-fg flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-4">
            <span className="text-2xl text-accent"></span>
          </div>
          <h1 className="text-lg font-bold mb-2">プレイヤーを安全に復旧中</h1>
          <p className="text-xs text-muted max-w-xs mb-6 leading-relaxed">
            再生セッションの一時的な不整合を検出しました。下のボタンを押すと直前の再生状態から安全に再開できます。
          </p>
          <button
            onClick={this.handleReset}
            className="py-3 px-6 rounded-full bg-accent text-on-accent text-xs font-semibold hover:bg-accent-hover active:scale-95 transition-all shadow-lg shadow-accent/20"
          >
            プレイヤーを再開する
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  // 画面の移動は utils/nav.ts のストアで管理（下のタブ・ライブラリの階層・設定ページ）
  const nav = useNav();
  const activeTab = nav.tab;
  const setActiveTab = navSetTab;

  const {
    isPlaying,
    isAdPlaying,
    isNowPlayingOpen,
    setIsNowPlayingOpen,
    nowPlayingTab,
    selectedArtistForDetail,
    setSelectedArtistForDetail,
  } = usePlayer();
  usePreLogSnapshot(); // ログ開始前の再生日を、上書きされる前に控える

  // 下のバーを、スクロールに合わせてたたむ・広げる
  useEffect(() => {
    installChromeScroll();
  }, []);

  // Permanently eliminate iOS Safari rubberband bounce
  useEffect(() => {
    const cleanup = initNoBounceScroll();
    return cleanup;
  }, []);

  const [videoMode] = usePref('melotrace_video_mode_v1', 'normal');

  // ステータスバー(時刻・電池表示)のタップで先頭へ
  useEffect(() => initStatusBarScrollTop(), []);

  // どのタブでも、離れる前のスクロール位置を覚えて、戻ったら復元する
  const mainRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = mainRef.current?.querySelector('.ios-scroll-container') as HTMLElement | null;
    if (!el) return;
    const key = `${activeTab}:${nav.lib}`;
    const target = scrollMem.get(key) ?? 0;
    el.scrollTop = target;
    // 一覧が遅れて描画される場合に備えて、数フレームのあいだ位置を合わせ直す
    let tries = 0;
    let raf = 0;
    const settle = () => {
      if (Math.abs(el.scrollTop - target) > 2 && tries++ < 12) {
        el.scrollTop = target;
        raf = requestAnimationFrame(settle);
      }
    };
    if (target > 0) raf = requestAnimationFrame(settle);
    let userScrolled = false;
    const onScroll = () => {
      if (tries >= 12 || Math.abs(el.scrollTop - target) <= 2) userScrolled = true;
      if (userScrolled || target === 0) scrollMem.set(key, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, [activeTab, nav.lib]);

  const isVideoVisible = isNowPlayingOpen && nowPlayingTab === 'video';

  // 動画の全画面表示（縦向きのときは、画面いっぱいに使えるよう横向きに回して表示する）
  const videoFs = useVideoFullscreen();
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  useEffect(() => {
    const onResize = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  useEffect(() => {
    if (!isVideoVisible) setVideoFullscreen(false);
  }, [isVideoVisible]);
  const inFs = isVideoVisible && videoFs;
  const videoFrameStyle: React.CSSProperties | undefined = inFs
    ? isPortrait
      ? { top: 0, left: 0, width: '100dvh', height: '100dvw', transformOrigin: 'top left', transform: 'translateX(100dvw) rotate(90deg)' }
      : { top: 0, left: 0, width: '100dvw', height: '100dvh' }
    : isVideoVisible
      ? { top: 'var(--vid-top, 5rem)', left: 'var(--vid-left, 4%)', width: 'var(--vid-w, 92%)' }
      : undefined;

  return (
    <div className="h-full w-full bg-app text-fg flex flex-col font-sans select-none overflow-hidden relative">
      {/* THE OFFICIAL PERSISTENT YOUTUBE PLAYER CONTAINER */}
      {/* Kept mounted in DOM to prevent audio interruption; hidden off-screen when not viewing video */}
      <div
        className={
          isVideoVisible
            ? inFs
              ? 'fixed z-[90] bg-black'
              : 'fixed z-[60] aspect-video rounded-2xl overflow-hidden shadow-2xl border border-fg/20 bg-black'
            : `fixed bottom-[calc(1rem+var(--bottom-gap,0px))] right-4 z-0 w-[200px] h-[200px] pointer-events-none opacity-[0.001] ${videoMode === 'quiet' ? 'invisible' : ''}`
        }
        id="yt-player-wrapper"
        data-ad={isAdPlaying ? '1' : '0'}
        style={videoFrameStyle}
      >
        <div id="yt-player-target" className="w-full h-full" />
      </div>
      {/* 動画表示中だけ、プレーヤーの上に重ねる層（一時停止中のサムネ・全画面のボタン） */}
      {isVideoVisible && (
        <VideoOverlay
          fullscreen={inFs}
          style={videoFrameStyle}
          className={inFs ? 'fixed z-[91]' : 'fixed z-[61] aspect-video rounded-2xl overflow-hidden'}
        />
      )}

      {/* Main View Area with zero-bounce scrolling */}
      <main ref={mainRef} className="flex-1 w-full max-w-lg mx-auto h-full overflow-hidden relative">
        <div key={`${activeTab}:${nav.lib}`} className="h-full mt-tab-in">
        {activeTab === 'home' && <HomeView setActiveTab={setActiveTab} />}
        {activeTab === 'radio' && <RadioView />}
        {activeTab === 'library' && nav.lib === 'root' && <LibraryRoot />}
        {activeTab === 'library' && ['all', 'vocaloid', 'bgm', 'favorites', 'playlists'].includes(nav.lib) && (
          <LibraryView section={nav.lib as 'all' | 'vocaloid' | 'bgm' | 'favorites' | 'playlists'} />
        )}
        {activeTab === 'library' && nav.lib === 'artists' && <ViewErrorBoundary label="アーティスト"><ArtistsView /></ViewErrorBoundary>}
        {activeTab === 'library' && nav.lib === 'favArtists' && <ViewErrorBoundary label="お気に入りのアーティスト"><ArtistsView favoritesOnly /></ViewErrorBoundary>}
        {activeTab === 'library' && nav.lib === 'history' && <ViewErrorBoundary label="再生履歴"><PlayHistoryView /></ViewErrorBoundary>}
        {activeTab === 'search' && (
          <SearchView onSelectArtist={(artist) => setSelectedArtistForDetail(artist)} />
        )}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'import' && <DataImportView setActiveTab={setActiveTab} />}
        </div>
      </main>

      {/* Global Quick Recovery & Audio Resync */}
      <QuickRecoveryModal />


      {/* Apple Music Full-Screen Now Playing Modal Sheet */}
      <NowPlayingModal />

      {/* 初回だけの「好きなアーティストを選ぶ」（設定からも開ける） */}
      <ArtistOnboarding />

      <Mascot />
      {!isNativeApp() && <AdTip onOpen={() => navSetTab('import')} />}
      <PlaybackToast />
      <DesktopModeBanner />
      <RetroPlayer />
      <BackgroundGuideModal />

      {/* Apple Music Artist Catalog Deep-Dive Modal */}
      <ArtistDetailModal
        artistName={selectedArtistForDetail}
        onClose={() => setSelectedArtistForDetail(null)}
      />

      {/* 下に浮かぶ、ガラスのタブバーとミニプレイヤー */}
      <AppChrome />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <PlayerProvider>
        <AppContent />
      </PlayerProvider>
    </ErrorBoundary>
  );
}
