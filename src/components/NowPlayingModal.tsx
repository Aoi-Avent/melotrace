import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Heart,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Timer,
  Tv,
  Quote,
  ListMusic,
  Disc3,
  ExternalLink,
  Search,
  Edit3,
  Ban,
  Check,
  X,
  Sparkles,
  Loader2,
  Maximize2,
  RotateCcw,
  Trash2,
  Music,
  Layers,
  Smartphone,
  Minus,
  Plus,
  Crosshair,
  Disc,
  Star,
  List,
  MessageSquareQuote,
  Volume,
  Volume2,
  Pencil,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { setVideoFullscreen } from '../utils/videoFullscreen';
import { isNativeApp } from '../utils/platform';
import { isIOSDevice } from '../utils/deviceMode';
import { AppleSlider, PauseGlyph, PlayGlyph, BackwardGlyph, ForwardGlyph, EllipsisGlyph } from './AppleControls';
import { parseLrcLyrics, extractSmartTrackMeta } from '../utils/parser';
import {
  getLyricsForTrack,
  searchLyricsCandidates,
  purgeLyricsCache,
  convertPlainToSyncedLines,
  LrcLibTrack,
} from '../utils/lyricsService';
import { LyricLine } from '../types/music';
import { WaitIndicator } from './WaitIndicator';
import { formatTime, formatRemainingTime, sheetBtn, sheetChip, ytThumbChain } from './nowPlayingHelpers';
import { ManualLyricsModal, LyricsSearchModal } from './LyricsModals';
import { usePlayerTime } from '../utils/timeStore';

export const NowPlayingModal: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    playbackRate,
    queue,
    repeatMode,
    isShuffle,
    sleepTimerMinutes,
    isNowPlayingOpen,
    isLoadingLyrics,
    setSelectedArtistForDetail,
    banArtist,
    banTrack,
    setCustomLyrics,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setPlaybackRate,
    setRepeatMode,
    setIsShuffle,
    setSleepTimer,
    toggleFavorite,
    playTrack,
    setIsNowPlayingOpen,
    nowPlayingTab,
    setNowPlayingTab,
    isAdPlaying,
    volume,
    setVolume,
    favoriteArtists,
    toggleFavoriteArtist,
    playlists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    lyricsOffset,
    adjustLyricsOffset,
    resetLyricsOffset,
    lyricsDisplayMode,
    setLyricsDisplayMode,
    artworkAspectRatio,
    setArtworkAspectRatio,
    setIsRetroPlayerOpen,
    setIsBgGuideOpen,
    artworkSource,
    setArtworkSource,
    albumArtFor,
    albumArtState,
    retryAlbumArt,
  } = usePlayer();
  const { currentTime, duration } = usePlayerTime();

  // 動画表示モード: 埋め込みプレーヤーを、ジャケット/サムネと同じ位置に重ねるため、枠の位置を共有する
  const videoSlotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nowPlayingTab !== 'video') return;
    const root = document.documentElement;
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = videoSlotRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const key = `${r.top.toFixed(1)}|${r.left.toFixed(1)}|${r.width.toFixed(1)}`;
        if (key !== last) {
          last = key;
          root.style.setProperty('--vid-top', `${r.top}px`);
          root.style.setProperty('--vid-left', `${r.left}px`);
          root.style.setProperty('--vid-w', `${r.width}px`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ['--vid-top', '--vid-left', '--vid-w'].forEach((k) => root.style.removeProperty(k));
    };
  }, [nowPlayingTab]);

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showManualLyricsModal, setShowManualLyricsModal] = useState(false);
  const [manualLyricsInput, setManualLyricsInput] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [customSearchTitle, setCustomSearchTitle] = useState('');
  const [customSearchArtist, setCustomSearchArtist] = useState('');
  const [searchErrorMsg, setSearchErrorMsg] = useState<string | null>(null);
  const [isReSearching, setIsReSearching] = useState(false);
  const [candidatesList, setCandidatesList] = useState<LrcLibTrack[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);
  const [hasSearchedCandidates, setHasSearchedCandidates] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const [imgRatio, setImgRatio] = useState<number>(16 / 9);
  const [alignMode, setAlignMode] = useState(false);
  const [ytIdx, setYtIdx] = useState(0); // 高画質→低画質の順に試すサムネイルの段階
  const [albumFailed, setAlbumFailed] = useState(false);
  const panRef = useRef<HTMLDivElement | null>(null);
  const panImgRef = useRef<HTMLImageElement | null>(null);
  const panOffsetRef = useRef(0);
  const panInertiaRef = useRef(0);
  const panGestureRef = useRef({ startX: 0, startY: 0, startOffset: 0, active: false, locked: false, lastX: 0, lastT: 0, v: 0 });

  // 横長の画像を、1:1の枠の中で左右にスライドして見るための操作。
  // ブラウザ標準のスクロールだと端で「ぐにゃっ」と伸びるので、自前で動かして、端でぴたっと止める。
  const panMax = () => {
    const f = panRef.current;
    const i = panImgRef.current;
    if (!f || !i) return 0;
    return Math.max(0, i.offsetWidth - f.clientWidth);
  };
  const applyPan = (x: number) => {
    const max = panMax();
    const c = Math.min(0, Math.max(-max, x));
    panOffsetRef.current = c;
    if (panImgRef.current) panImgRef.current.style.transform = `translate3d(${c}px,0,0)`;
    return c;
  };
  const centerPan = () => {
    applyPan(-panMax() / 2);
  };
  const endPan = () => {
    const g = panGestureRef.current;
    const wasPanning = g.active && g.locked;
    g.active = false;
    if (!wasPanning) return;
    // 指を離したあとの、ゆるやかな慣性。端に着いたらその場でぴたっと止まる（跳ね返りなし）
    let v = g.v;
    let last = performance.now();
    cancelAnimationFrame(panInertiaRef.current);
    const step = (t: number) => {
      const dt = Math.min(32, t - last);
      last = t;
      const want = panOffsetRef.current + v * dt;
      const got = applyPan(want);
      v *= Math.exp(-dt / 220);
      if (Math.abs(v) < 0.02 || got !== want) return;
      panInertiaRef.current = requestAnimationFrame(step);
    };
    if (Math.abs(v) > 0.05) panInertiaRef.current = requestAnimationFrame(step);
  };

  // 再生画面を、上から下へのスワイプで閉じる（指に追従して下がり、離すと閉じるか元に戻る）
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; t: number; axis: 'v' | 'n' | null; dy: number }>({ x: 0, y: 0, t: 0, axis: null, dy: 0 });
  const closingRef = useRef(false);
  const closeWithAnimation = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setDragging(false);
    setDragY(window.innerHeight);
    window.setTimeout(() => {
      setIsNowPlayingOpen(false);
      setDragY(0);
      closingRef.current = false;
    }, 260);
  };
  const finishDrag = () => {
    const d = dragRef.current;
    if (d.axis !== 'v') {
      d.axis = null;
      return;
    }
    const vel = d.dy / Math.max(1, performance.now() - d.t);
    d.axis = null;
    if (d.dy > 120 || (d.dy > 40 && vel > 0.5)) closeWithAnimation();
    else {
      setDragging(false);
      setDragY(0);
    }
  };
  const dragProps = {
    onTouchStart: (e: React.TouchEvent) => {
      if (closingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      dragRef.current = { x: t.clientX, y: t.clientY, t: performance.now(), axis: null, dy: 0 };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const d = dragRef.current;
      if (closingRef.current || d.axis === 'n') return;
      const t = e.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (d.axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // 縦（下向き）が主なら、閉じる操作。それ以外（横スライドなど）は何もしない
        d.axis = Math.abs(dy) > Math.abs(dx) && dy > 0 ? 'v' : 'n';
        if (d.axis !== 'v') return;
        setDragging(true);
      }
      d.dy = Math.max(0, dy);
      setDragY(d.dy);
    },
    onTouchEnd: finishDrag,
    onTouchCancel: finishDrag,
  };

  // 「…」メニューのプレイリスト操作
  const [plEditMode, setPlEditMode] = useState(false);
  const [showNewPl, setShowNewPl] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  useEffect(() => {
    setImgError(false);
    setImgRatio(16 / 9);
    setAlignMode(false);
    setYtIdx(0);
    setAlbumFailed(false);
  }, [currentTrack?.id]);

  // 実際に取得できた画像の縦横比から、1:1 か 16:9 かを判定
  const isSquareImage = imgRatio < 1.3;
  const albumArt = currentTrack && artworkSource === 'album' && !albumFailed ? albumArtFor(currentTrack.id) : null;
  const albumStatus = currentTrack ? albumArtState(currentTrack.id) : 'unknown';
  const YT_CHAIN = currentTrack ? ytThumbChain(currentTrack.id) : [];
  const artSrc = albumArt ? albumArt.url : YT_CHAIN[Math.min(ytIdx, YT_CHAIN.length - 1)];
  const artIsWide =
    artworkAspectRatio === '16:9' ? true : artworkAspectRatio === '1:1' ? false : !isSquareImage;
  // 「1:1」を選んだまま横長画像(16:9)のとき: 切り取らず、横にスクロールして全体を見られるようにする
  const panMode = !artIsWide && imgRatio >= 1.3;

  // Clean meta
  const trackMeta = React.useMemo(() => {
    if (!currentTrack) return null;
    return extractSmartTrackMeta(currentTrack.title, currentTrack.artist);
  }, [currentTrack]);

  // Parse lyrics
  const parsedLyrics: LyricLine[] = React.useMemo(() => {
    if (!currentTrack?.lyrics) return [];
    return parseLrcLyrics(currentTrack.lyrics);
  }, [currentTrack?.lyrics]);

  // Active lyric index
  const activeLyricIndex = React.useMemo(() => {
    if (!parsedLyrics.length) return -1;
    const t = currentTime + lyricsOffset;
    for (let i = parsedLyrics.length - 1; i >= 0; i--) {
      if (t >= parsedLyrics[i].time) {
        return i;
      }
    }
    return 0;
  }, [parsedLyrics, currentTime, lyricsOffset]);

  // Auto-scroll active lyric to center (dynamic mode only; scrolls only the lyrics container)
  useEffect(() => {
    if (nowPlayingTab !== 'lyrics' || lyricsDisplayMode !== 'dynamic') return;
    const container = lyricsContainerRef.current;
    if (!container || activeLyricIndex < 0) return;
    const activeEl = container.children[activeLyricIndex] as HTMLElement | undefined;
    if (!activeEl) return;
    const top = activeEl.offsetTop - container.clientHeight / 2 + activeEl.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeLyricIndex, nowPlayingTab, lyricsDisplayMode, parsedLyrics.length]);

  if (!isNowPlayingOpen || !currentTrack) return null;

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const displayProgress = isSeeking ? seekVal : progress;
  const displayTime = isSeeking ? (seekVal / 100) * duration : currentTime;

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSeeking(true);
    setSeekVal(parseFloat(e.target.value));
  };

  const handleSeekCommit = () => {
    if (isSeeking) {
      const nextSec = (seekVal / 100) * duration;
      seekTo(nextSec);
      setIsSeeking(false);
    }
  };

  const cycleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  // Execute candidate search from LRCLib API
  const handleExecuteCandidateSearch = async (title?: string, artist?: string) => {
    const qTitle = (title !== undefined ? title : customSearchTitle).trim();
    const qArtist = (artist !== undefined ? artist : customSearchArtist).trim();
    if (!qTitle) return;

    setIsSearchingCandidates(true);
    setSearchErrorMsg(null);
    setHasSearchedCandidates(true);
    try {
      const candidates = await searchLyricsCandidates(qTitle, qArtist);
      setCandidatesList(candidates);
      if (candidates.length === 0) {
        setSearchErrorMsg('指定したキーワードに一致する歌詞候補が見つかりませんでした。別の曲名表記（英字・カナ）や原曲P名での検索、または手動貼り付けをお試しください。');
      }
    } catch (e: any) {
      setSearchErrorMsg('歌詞候補の検索中に通信エラーが発生しました。');
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  // Re-search lyrics with custom keywords form submit
  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleExecuteCandidateSearch();
  };

  // User selects a specific candidate from the list
  const handleSelectCandidate = (candidate: LrcLibTrack) => {
    if (!currentTrack) return;
    if (candidate.syncedLyrics) {
      setCustomLyrics(currentTrack.id, candidate.syncedLyrics);
    } else if (candidate.plainLyrics) {
      const synced = convertPlainToSyncedLines(candidate.plainLyrics, duration || 240);
      setCustomLyrics(currentTrack.id, synced);
    }
    setShowSearchModal(false);
    setCandidatesList([]);
    setHasSearchedCandidates(false);
  };

  // Delete/Clear lyrics for current track
  const handleClearLyrics = () => {
    if (!currentTrack) return;
    purgeLyricsCache(currentTrack.id);
    setCustomLyrics(currentTrack.id, '');
    setShowSearchModal(false);
    setShowMoreMenu(false);
  };

  // Force re-fetch from cache purge
  const handleResyncLyrics = async () => {
    resetLyricsOffset();
    await handleForceReloadLyrics();
  };

  const handleForceReloadLyrics = async () => {
    if (!currentTrack) return;
    purgeLyricsCache(currentTrack.id);
    setCustomLyrics(currentTrack.id, '');
    setIsReSearching(true);
    const res = await getLyricsForTrack(
      trackMeta?.originalProducer || currentTrack.artist,
      trackMeta?.cleanTitle || currentTrack.title,
      duration
    );
    setIsReSearching(false);
    if (res) {
      setCustomLyrics(currentTrack.id, res);
    }
  };

  const handleSaveManualLyrics = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLyricsInput.trim()) return;
    setCustomLyrics(currentTrack.id, manualLyricsInput.trim());
    setShowManualLyricsModal(false);
    setManualLyricsInput('');
  };

  const showVolume = !isIOSDevice();

  // 曲名・アーティスト・お気に入り（☆）・「…」の行。歌詞や待機列の表示中は、小さなジャケット付きの省スペース版にする
  const infoRow = (compact: boolean) => (
    <div className={`shrink-0 flex items-center gap-3 ${compact ? 'pb-3' : 'pt-5 pb-3'}`} {...dragProps}>
      {compact && (
        <img
          src={albumArt ? albumArt.url : `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`}
          alt=""
          referrerPolicy="no-referrer"
          className="w-[52px] h-[52px] rounded-lg object-cover shrink-0 bg-white/10"
        />
      )}
      <div key={currentTrack.id} className="min-w-0 flex-1 animate-in fade-in slide-in-from-bottom-1 duration-300">
        <h2 className={`${compact ? 'text-[17px]' : 'text-[22px]'} font-semibold text-white truncate leading-tight tracking-tight`}>
          {currentTrack.title}
        </h2>
        <button
          onClick={() => setSelectedArtistForDetail(currentTrack.artist)}
          className={`${compact ? 'text-[17px]' : 'text-[22px]'} text-white/55 truncate max-w-full text-left leading-tight block`}
          title="このアーティストの他の曲・アルバムを開く"
        >
          {currentTrack.artist}
        </button>
      </div>
      <button
        onClick={() => toggleFavorite(currentTrack.id)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
        aria-label="お気に入り"
      >
        <Star className={`w-[26px] h-[26px] ${currentTrack.isFavorite ? 'fill-white mt-pop' : 'stroke-[1.8]'}`} />
      </button>
      <button
        onClick={() => setShowMoreMenu(true)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
        aria-label="その他のメニュー"
      >
        <EllipsisGlyph className="w-[26px] h-[26px]" />
      </button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-[#000000] flex flex-col justify-between overflow-hidden animate-in fade-in slide-in-from-bottom duration-300 mt-sheet"
      style={{
        transform: `translateY(${dragY}px)`,
        transition: dragging ? 'none' : 'transform 0.26s cubic-bezier(0.22, 0.8, 0.2, 1)',
      }}
    >
      {/* Apple Music 風の背景: ジャケットの色をぼかして全体に敷く */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none mt-ambient">
        <div
          className="absolute inset-[-25%] bg-cover bg-center"
          style={{
            backgroundImage: `url(${albumArt ? albumArt.url : `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`})`,
            filter: 'blur(56px) saturate(1.5)',
            opacity: 0.8,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/75" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full max-w-md mx-auto px-6 pt-[max(env(safe-area-inset-top,0px),12px)] pb-[max(env(safe-area-inset-bottom,0px),12px)]">
        {/* つまみ（タップで閉じる） */}
        <div className="shrink-0 flex justify-center pt-2 pb-4" {...dragProps}>
          <button
            onClick={closeWithAnimation}
            aria-label="閉じる"
            className="px-10 py-2 -my-2"
          >
            <span className="block w-[60px] h-[5px] rounded-full bg-white/40" />
          </button>
        </div>

        {/* ===== ジャケット / 動画 ===== */}
        {(nowPlayingTab === 'art' || nowPlayingTab === 'video') && (
          <>
            <div className="np-stage flex-1 min-h-0 relative flex items-center justify-center" {...dragProps}>
              {nowPlayingTab === 'art' ? (
                <div
                  className={`np-art ${artIsWide ? 'aspect-video' : 'aspect-square'} relative rounded-2xl overflow-hidden shadow-[0_20px_44px_rgba(0,0,0,0.45)] flex items-center justify-center bg-white/10 shrink-0 mt-art-frame transition-transform duration-500 ease-out ${
                    isPlaying ? 'scale-100' : 'scale-[0.88]'
                  }`}
                >
            {!imgError ? (
              (() => {
                const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
                  const img = e.currentTarget;
                  // YouTubeは画像が無い場合、120x90 前後の代替画像を返すので、その場合は次の画質へ
                  if (!albumArt && img.naturalWidth <= 130 && ytIdx < YT_CHAIN.length - 1) {
                    setYtIdx((i) => i + 1);
                    return;
                  }
                  if (img.naturalWidth && img.naturalHeight) setImgRatio(img.naturalWidth / img.naturalHeight);
                  // 横長画像は、中央が見える位置から始める
                  requestAnimationFrame(centerPan);
                };
                const onError = () => {
                  if (albumArt) setAlbumFailed(true);
                  else if (ytIdx < YT_CHAIN.length - 1) setYtIdx((i) => i + 1);
                  else setImgError(true);
                };
                return panMode ? (
                  <div
                    ref={panRef}
                    className="absolute inset-0 overflow-hidden"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(e) => {
                      cancelAnimationFrame(panInertiaRef.current);
                      const g = panGestureRef.current;
                      g.startX = e.clientX;
                      g.startY = e.clientY;
                      g.startOffset = panOffsetRef.current;
                      g.active = true;
                      g.locked = false;
                      g.lastX = e.clientX;
                      g.lastT = performance.now();
                      g.v = 0;
                    }}
                    onPointerMove={(e) => {
                      const g = panGestureRef.current;
                      if (!g.active) return;
                      const dx = e.clientX - g.startX;
                      const dy = e.clientY - g.startY;
                      if (!g.locked) {
                        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
                          g.locked = true;
                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch (err) {}
                        } else if (Math.abs(dy) > 6) {
                          g.active = false; // 縦の動きは、再生画面を閉じる操作に任せる
                          return;
                        } else {
                          return;
                        }
                      }
                      const now = performance.now();
                      const dt = now - g.lastT;
                      if (dt > 0) g.v = 0.8 * g.v + 0.2 * ((e.clientX - g.lastX) / dt);
                      g.lastX = e.clientX;
                      g.lastT = now;
                      applyPan(g.startOffset + dx);
                    }}
                    onPointerUp={endPan}
                    onPointerCancel={endPan}
                  >
                    <img
                      ref={panImgRef}
                      key={artSrc}
                      src={artSrc}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      onError={onError}
                      onLoad={onLoad}
                      draggable={false}
                      className="h-full w-auto max-w-none select-none will-change-transform"
                    />
                  </div>
                ) : (
                  <img
                    key={artSrc}
                    src={artSrc}
                    alt={currentTrack.title}
                    referrerPolicy="no-referrer"
                    onError={onError}
                    onLoad={onLoad}
                    className="w-full h-full object-cover mt-focus animate-in fade-in duration-500"
                  />
                );
              })()
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                <Disc3 className={`w-16 h-16 text-accent mb-2 ${isBuffering ? "animate-spin" : ""}`} />
                <p className="text-sm font-bold text-white line-clamp-2">{currentTrack.title}</p>
                <p className="text-xs text-[#8e8e93] mt-1">{currentTrack.artist}</p>
              </div>
            )}

            {/* Vocaloid or Cover Tag */}
            {trackMeta?.originalProducer && (
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/70 text-[10px] font-bold text-[#af52de] border border-white/10">
                ボカロ原曲: {trackMeta.originalProducer}
              </div>
            )}
                </div>
              ) : (
                <>
                  {/* 埋め込みプレーヤーはこの枠の位置に重なる（ジャケットと同じ大きさ・位置） */}
                  <div ref={videoSlotRef} className="np-art aspect-video rounded-2xl shrink-0 pointer-events-none" />
                  <button
                    onClick={() => setVideoFullscreen(true)}
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-white/15 text-[12px] font-semibold text-white flex items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    全画面
                  </button>
                </>
              )}
            </div>
            {infoRow(false)}
          </>
        )}

        {/* ===== 歌詞 ===== */}
        {nowPlayingTab === 'lyrics' && (
          <>
            {infoRow(true)}
            <div className="flex-1 min-h-0 flex flex-col">
          <div className="w-full h-full flex flex-col items-center justify-start min-h-0">
            {/* Top Lyrics Action Ribbon */}
            <div className="w-full max-w-sm flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl bg-white/10 border border-white/10 text-xs shrink-0 z-20">
              <div className="flex items-center gap-1.5 text-white/80 font-medium">
                <Quote className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-bold">歌詞設定</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setCustomSearchTitle(trackMeta?.cleanTitle || currentTrack.title);
                    setCustomSearchArtist(trackMeta?.originalProducer || currentTrack.artist);
                    setShowSearchModal(true);
                    handleExecuteCandidateSearch(trackMeta?.cleanTitle || currentTrack.title, trackMeta?.originalProducer || currentTrack.artist);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  title="別の歌詞候補を探す"
                >
                  <Search className="w-3 h-3 text-accent" />
                  <span>別の候補</span>
                </button>
                <button
                  onClick={handleResyncLyrics}
                  disabled={isReSearching}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition-colors"
                  title="歌詞を再取得してタイミングを再同期"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isReSearching ? 'animate-spin text-accent' : ''}`} />
                </button>
                <button
                  onClick={() => {
                    setManualLyricsInput(currentTrack.lyrics || '');
                    setShowManualLyricsModal(true);
                  }}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition-colors"
                  title="手動で貼り付け・編集"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#30d158]" />
                </button>
                {currentTrack.lyrics && (
                  <button
                    onClick={handleClearLyrics}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-accent/20 text-[#8e8e93] hover:text-accent text-[11px] font-medium transition-colors"
                    title="この曲の歌詞を消去（リセット）"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {isLoadingLyrics ? (
              <div className="m-auto flex flex-col items-center gap-3 text-white/60">
                <Loader2 className="w-7 h-7 text-accent animate-spin" />
                <p className="text-xs font-medium">歌詞データを検索中...</p>
              </div>
            ) : parsedLyrics.length > 0 ? (
              <div className="w-full flex-1 min-h-0 flex flex-col">
                {/* Timing / mode controls */}
                <div className="w-full flex items-center justify-between gap-1 px-1 pb-2 shrink-0 text-[10px] font-semibold text-white/80">
                  <div className="flex items-center gap-0.5 rounded-full bg-white/10 p-0.5">
                    <button onClick={() => adjustLyricsOffset(-0.3)} className="px-2 py-1 rounded-full hover:bg-white/15 flex items-center gap-0.5" title="歌詞を0.3秒遅くする">
                      <Minus className="w-3 h-3" />遅く
                    </button>
                    <button onClick={resetLyricsOffset} className="px-1.5 py-1 tabular-nums min-w-[44px] text-center" title="ズレをリセット">
                      {lyricsOffset > 0 ? '+' : ''}{lyricsOffset.toFixed(1)}s
                    </button>
                    <button onClick={() => adjustLyricsOffset(0.3)} className="px-2 py-1 rounded-full hover:bg-white/15 flex items-center gap-0.5" title="歌詞を0.3秒早くする">
                      早く<Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => setAlignMode((v) => !v)}
                    className={`px-2 py-1.5 rounded-full flex items-center gap-1 ${alignMode ? 'bg-accent text-on-accent' : 'bg-white/10'}`}
                    title="歌っている行をタップして、その行に合わせます"
                  >
                    <Crosshair className="w-3 h-3" />合わせる
                  </button>
                  <button
                    onClick={() => setLyricsDisplayMode(lyricsDisplayMode === 'dynamic' ? 'static' : 'dynamic')}
                    className="px-2 py-1.5 rounded-full bg-white/10"
                    title="歌詞の表示方式（動的 / 静的）"
                  >
                    {lyricsDisplayMode === 'dynamic' ? '動的' : '静的'}
                  </button>
                </div>
                {alignMode && (
                  <p className="text-[10px] text-accent pb-1 px-1 shrink-0">
                    いま歌っている行をタップすると、その行がこの瞬間に来るよう自動調整します。
                  </p>
                )}
                <div
                  ref={lyricsContainerRef}
                  className="relative w-full flex-1 min-h-0 overflow-y-auto px-4 py-6 flex flex-col gap-5 text-left select-none ios-scroll-container"
                >
                  {parsedLyrics.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    const dynamic = lyricsDisplayMode === 'dynamic';
                    // 改行位置が動かないよう、文字サイズ・幅は常に固定。強調は transform(scale)/色/不透明度のみで行う。
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (alignMode) {
                            // この行が「今」に来るようオフセットを算出（0.1秒単位）
                            const next = Math.round((line.time - currentTime) * 10) / 10;
                            adjustLyricsOffset(next - lyricsOffset);
                            setAlignMode(false);
                          } else {
                            seekTo(Math.max(0, line.time - lyricsOffset));
                          }
                        }}
                        style={dynamic ? { width: '83%' } : undefined}
                        className={`cursor-pointer font-bold leading-relaxed text-xl whitespace-pre-wrap break-words origin-left transition-[transform,opacity,color] duration-300 will-change-transform ${
                          isActive
                            ? `text-white opacity-100 ${dynamic ? 'scale-[1.2]' : 'underline decoration-accent decoration-2 underline-offset-4'}`
                            : 'text-white/40 opacity-70 hover:text-white/80'
                        }`}
                      >
                        {line.text}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* REAL MISSING STATE (No fake lyrics! Gives user clear actions) */
              <div className="m-auto text-center text-white/70 p-4 max-w-xs flex flex-col items-center gap-3">
                <Quote className="w-10 h-10 text-white/20" />
                <div>
                  <p className="text-sm font-bold text-white">この曲の同期歌詞は見つかりませんでした</p>
                  <p className="text-xs text-[#8e8e93] mt-1">
                    マニアックな曲や独自アレンジ・歌ってみた等は、1タップでWeb検索や手動登録が可能です。
                  </p>
                </div>

                <div className="flex flex-col gap-2 w-full mt-2">
                  {/* Search candidate list */}
                  <button
                    onClick={() => {
                      setCustomSearchTitle(trackMeta?.cleanTitle || currentTrack.title);
                      setCustomSearchArtist(trackMeta?.originalProducer || currentTrack.artist);
                      setShowSearchModal(true);
                      handleExecuteCandidateSearch(trackMeta?.cleanTitle || currentTrack.title, trackMeta?.originalProducer || currentTrack.artist);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-accent/25"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>歌詞の候補を探す / 再検索</span>
                  </button>

                  {/* Direct 1-tap Google Lyrics Search */}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      `${currentTrack.title} ${currentTrack.artist} 歌詞`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-accent" />
                    <span>Webで歌詞を調べる (Google)</span>
                  </a>

                  {/* Manual Paste/Edit Lyrics */}
                  <button
                    onClick={() => {
                      setManualLyricsInput(currentTrack.lyrics || '');
                      setShowManualLyricsModal(true);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#30d158]" />
                    <span>歌詞を手動で貼り付け / 登録</span>
                  </button>
                </div>
              </div>
            )}
          </div>
            </div>
          </>
        )}

        {/* ===== 再生待機列 ===== */}
        {nowPlayingTab === 'queue' && (
          <>
            {infoRow(true)}
            <div className="flex-1 min-h-0 flex flex-col">
          <div className="w-full flex-1 min-h-0 overflow-y-auto px-2 py-2 flex flex-col gap-2 ios-scroll-container">
            <div className="flex items-center justify-between px-2 mb-1">
              <h4 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wider">
                次に再生 ({queue.length}曲)
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition ${isShuffle ? 'bg-white text-black' : 'bg-white/15 text-white'}`}
                  aria-label="シャッフル"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button
                  onClick={cycleRepeat}
                  className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition ${repeatMode !== 'off' ? 'bg-white text-black' : 'bg-white/15 text-white'}`}
                  aria-label="リピート"
                >
                  {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {queue.map((t, idx) => {
              const isCurrent = t.id === currentTrack.id;
              return (
                <div
                  key={`${t.id}_${idx}`}
                  onClick={() => playTrack(t)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${
                    isCurrent ? 'bg-white/15 text-white font-semibold' : 'hover:bg-white/5 text-[#d1d1d6]'
                  }`}
                >
                  <img
                    src={`https://img.youtube.com/vi/${t.id}/mqdefault.jpg`}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-cover shrink-0 bg-[#2c2c2e]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{t.title}</p>
                    <p className="text-[11px] text-[#8e8e93] truncate">{t.artist}</p>
                  </div>
                  {isCurrent && (
                    <div className="flex items-end gap-[2px] h-3 shrink-0 px-2">
                      <span className="w-1 bg-accent rounded-full apple-eq-bar-1" />
                      <span className="w-1 bg-accent rounded-full apple-eq-bar-2" />
                      <span className="w-1 bg-accent rounded-full apple-eq-bar-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
            </div>
          </>
        )}

        {/* 広告中の表示 */}
        {isAdPlaying && (
          <div className="shrink-0 mb-2 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>広告終了までお待ちください（消音・2倍速中）</span>
            </span>
            <span className="text-[10px] text-amber-300 font-semibold shrink-0">まもなく始まります</span>
          </div>
        )}

        {/* ===== 再生バー ===== */}
        <div className="shrink-0 pt-1">
          <AppleSlider
            value={displayProgress / 100}
            ariaLabel="再生位置"
            onScrub={(v) => {
              setIsSeeking(true);
              setSeekVal(v * 100);
            }}
            onCommit={(v) => {
              setIsSeeking(true);
              setSeekVal(v * 100);
              seekTo(v * duration);
              // 再生側の位置が追いつくまで、バーが一瞬戻らないように少し待つ
              window.setTimeout(() => setIsSeeking(false), 700);
            }}
          />
          <div className="flex justify-between items-center -mt-1 text-[13px] font-semibold text-white/35 tabular-nums">
            <span>{formatTime(displayTime)}</span>
            <WaitIndicator className="-mt-0.5" />
            <span>{formatRemainingTime(displayTime, duration)}</span>
          </div>
        </div>

        {/* ===== 前の曲 / 再生・一時停止 / 次の曲 ===== */}
        <div className="shrink-0 flex items-center justify-center gap-[27px] pt-3 pb-4">
          <button
            onClick={prevTrack}
            className="w-20 h-16 flex items-center justify-center text-white active:scale-90 active:opacity-60 transition"
            aria-label="前の曲"
          >
            <BackwardGlyph className="w-10 h-6" />
          </button>
          <button
            onClick={togglePlay}
            className="w-20 h-16 flex items-center justify-center text-white active:scale-90 active:opacity-60 transition mt-key"
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            {(isBuffering || isAdPlaying) && isPlaying ? (
              <Loader2 className="w-9 h-9 animate-spin" />
            ) : isPlaying ? (
              <PauseGlyph className="w-[30px] h-10" />
            ) : (
              <PlayGlyph className="w-[34px] h-10" />
            )}
          </button>
          <button
            onClick={nextTrack}
            className="w-20 h-16 flex items-center justify-center text-white active:scale-90 active:opacity-60 transition"
            aria-label="次の曲"
          >
            <ForwardGlyph className="w-10 h-6" />
          </button>
        </div>

        {/* ===== 音量（iPhone / iPad ではWebから変えられないため、表示しない） ===== */}
        {showVolume && (
          <div className="shrink-0 flex items-center gap-3 pb-3 text-white/55">
            <Volume className="w-4 h-4 shrink-0" />
            <div className="flex-1">
              <AppleSlider
                value={volume / 100}
                ariaLabel="音量"
                onScrub={(v) => setVolume(v * 100)}
                onCommit={(v) => setVolume(v * 100)}
              />
            </div>
            <Volume2 className="w-5 h-5 shrink-0" />
          </div>
        )}

        {/* ===== 下の3つのボタン: 歌詞 / MV映像 / 再生待機列 ===== */}
        <div className="shrink-0 grid grid-cols-3 justify-items-center items-center pt-1">
          <button
            onClick={() => setNowPlayingTab(nowPlayingTab === 'lyrics' ? 'art' : 'lyrics')}
            className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${
              nowPlayingTab === 'lyrics' ? 'bg-white/45 text-[#14191c]' : 'text-white/55'
            }`}
            aria-label="歌詞"
          >
            <MessageSquareQuote className="w-[22px] h-[22px]" />
          </button>
          <button
            onClick={() => setNowPlayingTab(nowPlayingTab === 'video' ? 'art' : 'video')}
            className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${
              nowPlayingTab === 'video' ? 'bg-white/45 text-[#14191c]' : 'text-white/55'
            }`}
            aria-label="MV映像"
          >
            <Tv className="w-[22px] h-[22px]" />
          </button>
          <button
            onClick={() => setNowPlayingTab(nowPlayingTab === 'queue' ? 'art' : 'queue')}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${
              nowPlayingTab === 'queue' ? 'bg-white/45 text-[#14191c]' : 'text-white/55'
            }`}
            aria-label="再生待機列"
          >
            <List className="w-[22px] h-[22px]" />
            {(repeatMode !== 'off' || isShuffle) && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white/35 text-white flex items-center justify-center">
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-3 h-3" />
                ) : repeatMode === 'all' ? (
                  <Repeat className="w-3 h-3" />
                ) : (
                  <Shuffle className="w-3 h-3" />
                )}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ===== 「…」メニュー（下から出るシート） ===== */}
      {showMoreMenu && (
        <div className="fixed inset-0 z-[65] flex items-end" onClick={() => setShowMoreMenu(false)}>
          <div className="absolute inset-0 bg-black/55" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md mx-auto max-h-[80dvh] overflow-y-auto ios-scroll-container rounded-t-3xl bg-[#1c1c1e]/95 backdrop-blur-xl p-4 pb-[max(env(safe-area-inset-bottom,0px),16px)] animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mb-3 w-10 h-1 rounded-full bg-white/30" />

            <p className="text-[12px] font-semibold text-[#8e8e93] px-2 py-1">曲・アーティスト</p>
            <button onClick={() => toggleFavoriteArtist(currentTrack.artist)} className={sheetBtn}>
              <Star className={`w-4 h-4 text-accent ${favoriteArtists.includes(currentTrack.artist) ? 'fill-accent' : ''}`} />
              <span>
                {favoriteArtists.includes(currentTrack.artist)
                  ? 'このアーティストのお気に入りを解除'
                  : 'このアーティストをお気に入りに追加'}
              </span>
            </button>
            <button
              onClick={() => {
                setSelectedArtistForDetail(currentTrack.artist);
                setShowMoreMenu(false);
              }}
              className={sheetBtn}
            >
              <Sparkles className="w-4 h-4 text-accent" />
              <span>このアーティストの他の曲</span>
            </button>
            <button
              onClick={() => {
                banTrack(currentTrack.id);
                setShowMoreMenu(false);
                nextTrack();
              }}
              className={`${sheetBtn} !text-accent`}
            >
              <Ban className="w-4 h-4" />
              <span>この曲を非表示 (スキップ)</span>
            </button>
            <button
              onClick={() => {
                banArtist(currentTrack.artist);
                setShowMoreMenu(false);
                nextTrack();
              }}
              className={`${sheetBtn} !text-accent`}
            >
              <Ban className="w-4 h-4" />
              <span>このアーティストをBan</span>
            </button>

            <div className="flex items-center justify-between px-2 pt-3 pb-1">
              <p className="text-[12px] font-semibold text-[#8e8e93]">プレイリスト</p>
              {playlists.length > 0 && (
                <button
                  onClick={() => {
                    setPlEditMode((v) => !v);
                    setRenamingId(null);
                  }}
                  className="text-[13px] font-semibold text-accent"
                >
                  {plEditMode ? '完了' : '編集'}
                </button>
              )}
            </div>
            {!plEditMode ? (
              <div className="flex flex-wrap gap-2 px-1 pb-1">
                {playlists.map((pl) => {
                  const has = pl.trackIds.includes(currentTrack.id);
                  return (
                    <button
                      key={pl.id}
                      onClick={() =>
                        has ? removeTrackFromPlaylist(pl.id, currentTrack.id) : addTrackToPlaylist(pl.id, currentTrack.id)
                      }
                      className={sheetChip(has)}
                    >
                      {has ? '✓ ' : ''}
                      {pl.name}
                    </button>
                  );
                })}
                {showNewPl ? (
                  <form
                    className="flex items-center gap-2 w-full pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = newPlName.trim();
                      if (!name) return;
                      createPlaylist(name, undefined, undefined, [currentTrack.id]);
                      setNewPlName('');
                      setShowNewPl(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={newPlName}
                      onChange={(e) => setNewPlName(e.target.value)}
                      placeholder="プレイリスト名"
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white/10 text-[15px] text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <button type="submit" className="px-3.5 py-2 rounded-xl bg-accent text-on-accent text-[13px] font-bold">
                      作成して追加
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowNewPl(true)}
                    className="px-3.5 py-2 rounded-full text-[13px] font-semibold bg-accent/20 text-accent active:scale-95 transition"
                  >
                    ＋ 新規作成
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 px-1 pb-1">
                {playlists.map((pl) => (
                  <div key={pl.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/8">
                    {renamingId === pl.id ? (
                      <form
                        className="flex-1 flex items-center gap-2 min-w-0"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const name = renameVal.trim();
                          if (name) updatePlaylist(pl.id, { name });
                          setRenamingId(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white/10 text-[15px] text-white focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <button type="submit" className="text-[13px] font-bold text-accent shrink-0">
                          保存
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] text-white truncate">{pl.name}</p>
                          <p className="text-[11px] text-white/45">{pl.trackIds.length}曲</p>
                        </div>
                        <button
                          onClick={() => {
                            setRenamingId(pl.id);
                            setRenameVal(pl.name);
                          }}
                          className="w-9 h-9 flex items-center justify-center text-white/70 active:scale-90"
                          aria-label="名前を変更"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`「${pl.name}」を削除しますか？（曲自体は消えません）`)) deletePlaylist(pl.id);
                          }}
                          className="w-9 h-9 flex items-center justify-center text-accent active:scale-90"
                          aria-label="プレイリストを削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[12px] font-semibold text-[#8e8e93] px-2 pt-3 pb-1">再生速度</p>
            <div className="flex gap-2 px-1 pb-1">
              {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                <button key={rate} onClick={() => setPlaybackRate(rate)} className={sheetChip(playbackRate === rate)}>
                  {rate}x
                </button>
              ))}
            </div>

            <p className="text-[12px] font-semibold text-[#8e8e93] px-2 pt-3 pb-1">スリープタイマー</p>
            <div className="flex gap-2 flex-wrap px-1 pb-1">
              {[
                { label: 'オフ', val: null },
                { label: '15分', val: 15 },
                { label: '30分', val: 30 },
                { label: '45分', val: 45 },
                { label: '60分', val: 60 },
              ].map((item) => (
                <button key={item.label} onClick={() => setSleepTimer(item.val)} className={sheetChip(sleepTimerMinutes === item.val)}>
                  {item.label}
                </button>
              ))}
            </div>

            <p className="text-[12px] font-semibold text-[#8e8e93] px-2 pt-3 pb-1">ジャケットの表示</p>
            <div className="flex gap-2 flex-wrap px-1 pb-1">
              <button onClick={() => setArtworkSource('album')} className={sheetChip(artworkSource === 'album')}>
                ジャケット
              </button>
              <button onClick={() => setArtworkSource('youtube')} className={sheetChip(artworkSource === 'youtube')}>
                サムネ
              </button>
            </div>
            <div className="flex gap-2 flex-wrap px-1 pt-2 pb-1">
              {([['auto', '自動'], ['1:1', '1:1'], ['16:9', '16:9']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setArtworkAspectRatio(v)} className={sheetChip(artworkAspectRatio === v)}>
                  {l}
                </button>
              ))}
            </div>
            {artworkSource === 'album' && !albumArt && (
              <p className="text-[11px] text-white/60 px-2 pt-2 flex items-center gap-2">
                {albumStatus === 'unknown' ? 'ジャケットを探しています…' : 'この曲のジャケットは見つかりませんでした（サムネを表示中）'}
                {albumStatus === 'none' && (
                  <button onClick={() => retryAlbumArt(currentTrack)} className="underline text-white/80">
                    再検索
                  </button>
                )}
              </p>
            )}
            {albumArt && albumArt.album && <p className="text-[11px] text-white/60 px-2 pt-2 truncate">{albumArt.album}</p>}

            <p className="text-[12px] font-semibold text-[#8e8e93] px-2 pt-3 pb-1">歌詞</p>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                setCustomSearchTitle(trackMeta?.cleanTitle || currentTrack.title);
                setCustomSearchArtist(trackMeta?.originalProducer || currentTrack.artist);
                setShowSearchModal(true);
                handleExecuteCandidateSearch(trackMeta?.cleanTitle || currentTrack.title, trackMeta?.originalProducer || currentTrack.artist);
              }}
              className={sheetBtn}
            >
              <Search className="w-4 h-4 text-accent" />
              <span>歌詞の候補を探す / 再検索</span>
            </button>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                setManualLyricsInput(currentTrack.lyrics || '');
                setShowManualLyricsModal(true);
              }}
              className={sheetBtn}
            >
              <Edit3 className="w-4 h-4 text-[#30d158]" />
              <span>歌詞を手動で貼り付け・編集</span>
            </button>
            {currentTrack.lyrics && (
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  handleClearLyrics();
                }}
                className={`${sheetBtn} !text-accent`}
              >
                <Trash2 className="w-4 h-4" />
                <span>現在の歌詞を消去（リセット）</span>
              </button>
            )}

            <p className="text-[12px] font-semibold text-[#8e8e93] px-2 pt-3 pb-1">その他</p>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                setIsRetroPlayerOpen(true);
                setIsNowPlayingOpen(false);
              }}
              className={sheetBtn}
            >
              <Disc className="w-4 h-4" />
              <span>iPod / Walkman モード</span>
            </button>
            {!isNativeApp() && (
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  setIsBgGuideOpen(true);
                }}
                className={sheetBtn}
              >
                <Smartphone className="w-4 h-4" />
                <span>バックグラウンド再生のコツ</span>
              </button>
            )}
            <a
              href={`https://www.youtube.com/watch?v=${currentTrack.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={sheetBtn}
            >
              <ExternalLink className="w-4 h-4" />
              <span>YouTubeで開く</span>
            </a>
          </div>
        </div>
      )}

      {/* Manual Lyrics Paste Modal */}
      {showManualLyricsModal && (
        <ManualLyricsModal
          setShowManualLyricsModal={setShowManualLyricsModal}
          handleSaveManualLyrics={handleSaveManualLyrics}
          manualLyricsInput={manualLyricsInput}
          setManualLyricsInput={setManualLyricsInput}
        />
      )}

      {/* Re-Search / Candidate Selection Lyrics Modal */}
      {showSearchModal && (
        <LyricsSearchModal
          currentTrack={currentTrack}
          setShowSearchModal={setShowSearchModal}
          setShowManualLyricsModal={setShowManualLyricsModal}
          setCandidatesList={setCandidatesList}
          setHasSearchedCandidates={setHasSearchedCandidates}
          handleCustomSearch={handleCustomSearch}
          customSearchTitle={customSearchTitle}
          setCustomSearchTitle={setCustomSearchTitle}
          customSearchArtist={customSearchArtist}
          setCustomSearchArtist={setCustomSearchArtist}
          searchErrorMsg={searchErrorMsg}
          setSearchErrorMsg={setSearchErrorMsg}
          isSearchingCandidates={isSearchingCandidates}
          isReSearching={isReSearching}
          candidatesList={candidatesList}
          hasSearchedCandidates={hasSearchedCandidates}
          handleSelectCandidate={handleSelectCandidate}
          handleClearLyrics={handleClearLyrics}
        />
      )}
    </div>
  );
};
