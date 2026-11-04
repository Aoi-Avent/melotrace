import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MusicTrack,
  Playlist,
  RepeatMode,
  ArtworkAspectRatio,
  LyricsDisplayMode,
  UserAccount,
} from '../types/music';
import { DEMO_TRACKS, DEMO_PLAYLISTS } from '../data/demoData';
import { extractYouTubeId, extractSmartTrackMeta, isLikelyMusic, isBgmOrClassicalTrack } from '../utils/parser';
import { getLyricsForTrack } from '../utils/lyricsService';
import { audioKeepAlive } from '../utils/audioKeepAlive';
import { normalizeName } from '../utils/textMatch';
import { setupNativeBackgroundResume } from '../utils/nativeBackground';
import { applyTheme, getSavedThemeId, THEME_STORAGE_KEY } from '../utils/theme';
import { getStatus as getArtistStatus, needsCheck as artistNeedsCheck, verifyArtist, setOverride as setArtistOverrideStore } from '../utils/artistVerify';
import { findAlbumArt, getCachedArt, forgetArt } from '../utils/albumArt';
import { primeChime, startWaitChime } from '../utils/waitChime';
import { getPref, usePref } from '../utils/uiPrefs';
import { timeStore } from '../utils/timeStore';
import { appendPlayLog } from '../utils/playLog';
import { restoreResume, type ResumeRestore } from '../utils/resumeState';
import { useResumePersistence } from '../hooks/useResumePersistence';
import { contentSignature, hashString, decideSync, SyncBase, SyncMode, ApplyState } from '../utils/syncMerge';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_ID_ENV_NAME,
  requestAccessToken,
  fetchProfile,
  revokeToken,
  pullFromCloud,
  pushToCloud,
} from '../utils/cloudSync';
import { saveTracksToDB, putTracksToDB, deleteTracksFromDB, loadTracksFromDB, savePlaylistsToDB, loadPlaylistsFromDB, clearDB } from '../utils/db';

import type { PlayerContextType, PlayMetric } from './playerTypes';
import {
  STORAGE_KEY_TRACKS,
  STORAGE_KEY_PLAYLISTS,
  STORAGE_KEY_IS_DEMO,
  STORAGE_KEY_BANNED_ARTISTS,
  STORAGE_KEY_FAV_ARTISTS,
  STORAGE_KEY_BANNED_TRACKS,
  STORAGE_KEY_STRICTNESS,
  STORAGE_KEY_LAST_TRACK_ID,
  STORAGE_KEY_LAST_QUEUE_IDS,
  YT_HISTORY_KEY,
  LOCAL_MODIFIED_KEY,
  SYNC_BASE_KEY,
} from './playerConstants';
import { pickPlayableIndex, nowIso, nowLabel, readBase, writeBase } from './playerUtils';
import { buildRadioBatch } from '../utils/radio';
import { isRadioRefillDue, replaceUpcomingWithRadio, shouldShuffleNext } from '../utils/radioQueue';
import { readCachedNewReleases } from '../utils/newReleases';
import { useCharts } from '../utils/charts';

export type { PlayMetric };

const PlayerContext = createContext<PlayerContextType | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_IS_DEMO);
      if (saved !== null) return saved === 'true';
    } catch (e) {
      // ignore
    }
    return true;
  });

  const [strictnessMode, setStrictnessModeState] = useState<'strict' | 'standard' | 'all'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STRICTNESS);
      if (saved === 'strict' || saved === 'standard' || saved === 'all') return saved;
    } catch (e) {
      // ignore
    }
    return 'standard';
  });

  const [bannedArtists, setBannedArtists] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BANNED_ARTISTS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return [];
  });

  // お気に入りのアーティスト（端末に保存し、Googleアカウント同期の「設定」に含めて他の端末にも反映する）
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FAV_ARTISTS);
      if (saved) {
        const v = JSON.parse(saved);
        if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
      }
    } catch (e) {
      // ignore
    }
    return [];
  });

  const [bannedTracks, setBannedTracks] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BANNED_TRACKS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return [];
  });

  const [tracks, setTracks] = useState<MusicTrack[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRACKS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read stored tracks', e);
    }
    return DEMO_TRACKS;
  });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to read stored playlists', e);
    }
    return DEMO_PLAYLISTS;
  });

  const [artistFilterMode, setArtistFilterModeState] = useState<'all' | 'official'>(() => {
    try {
      return localStorage.getItem('melotrace_artist_filter_v1') === 'official' ? 'official' : 'all';
    } catch (e) {
      return 'all';
    }
  });
  const [verifyVersion, setVerifyVersion] = useState(0);
  const [verifyProgress, setVerifyProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Active unbanned tracks
  const activeTracks = useMemo(() => {
    const bannedT = new Set(bannedTracks);
    const bannedA = new Set(bannedArtists);
    const officialOnly = artistFilterMode === 'official';
    return tracks.filter((t) => {
      if (bannedT.has(t.id) || bannedA.has(t.artist)) return false;
      if (officialOnly && !t.isDemo && getArtistStatus(t.artist) !== 'verified') return false;
      return true;
    });
    // verifyVersion: 判定結果が増えたら再計算する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, bannedTracks, bannedArtists, artistFilterMode, verifyVersion]);

  // Pure music tracks (EXCLUDES Free BGM, Classical & Sleep soundscapes)
  const musicTracks = useMemo(() => {
    return activeTracks.filter((t) => !isBgmOrClassicalTrack(t));
  }, [activeTracks]);

  // Dedicated Free BGM & Atmosphere tracks
  const bgmTracks = useMemo(() => {
    return activeTracks.filter((t) => isBgmOrClassicalTrack(t));
  }, [activeTracks]);

  const [selectedArtistForDetail, setSelectedArtistForDetail] = useState<string | null>(null);

  // 前回の曲・位置・キュー（resume）。使えなければ null で、従来の復元（LAST_TRACK_ID / LAST_QUEUE_IDS）に戻る
  const resumeRef = useRef<ResumeRestore | null | undefined>(undefined);
  const getResume = (): ResumeRestore | null => {
    if (resumeRef.current === undefined) resumeRef.current = restoreResume({ tracks, bannedTracks, bannedArtists });
    return resumeRef.current;
  };

  // Restore last playing track or default to first music track
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(() => {
    const rs = getResume();
    if (rs) return rs.track;
    try {
      const lastId = localStorage.getItem(STORAGE_KEY_LAST_TRACK_ID);
      if (lastId) {
        const found = tracks.find((t) => t.id === lastId);
        if (found && !bannedTracks.includes(found.id) && !bannedArtists.includes(found.artist)) {
          return found;
        }
      }
    } catch (e) {
      // ignore
    }
    return musicTracks[0] || activeTracks[0] || null;
  });

  // Restore last queue or default to music tracks
  const [queue, setQueue] = useState<MusicTrack[]>(() => {
    const rs = getResume();
    if (rs) return rs.queue;
    try {
      const lastQueueIds = localStorage.getItem(STORAGE_KEY_LAST_QUEUE_IDS);
      if (lastQueueIds) {
        const ids: string[] = JSON.parse(lastQueueIds);
        if (Array.isArray(ids) && ids.length > 0) {
          const map = new Map(tracks.map((t) => [t.id, t]));
          const restored = ids
            .map((id) => map.get(id))
            .filter((t): t is MusicTrack => Boolean(t && !bannedTracks.includes(t.id) && !bannedArtists.includes(t.artist)));
          if (restored.length > 0) return restored;
        }
      }
    } catch (e) {
      // ignore
    }
    return musicTracks.length > 0 ? musicTracks : activeTracks;
  });

  // 復元した曲が復元したキューの何番目か（「次の曲」がずれないように）
  const [queueIndex, setQueueIndex] = useState<number>(() => {
    const i = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
    return i >= 0 ? i : 0;
  });
  // 復元した位置。最初の再生（resumePlayback）で一度だけ使う。自動再生はしない
  const resumeStartRef = useRef<{ id: string; sec: number } | null>(
    resumeRef.current && resumeRef.current.seconds > 0 ? { id: resumeRef.current.track.id, sec: resumeRef.current.seconds } : null
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  // 再生位置・長さは専用の保管場所（timeStore）に置く。ここで state にすると、動くたびにアプリ全体が描き直される
  const setCurrentTime = timeStore.setCurrentTime;
  const setDuration = timeStore.setDuration;
  const [powerMode] = usePref('melotrace_power_v1', 'off');
  const [isHiddenPage, setIsHiddenPage] = useState<boolean>(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  useEffect(() => {
    timeStore.setDuration(activeTracks[0]?.duration || 210);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onVis = () => setIsHiddenPage(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const [playbackRate, setPlaybackRateState] = useState<number>(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);

  // ---- ラジオ（関連曲の自動補充）。選曲は utils/radio.ts。ここは状態と配線だけ ----
  const [radioSeed, setRadioSeed] = useState<MusicTrack | null>(null);
  const radioSeedRef = useRef<MusicTrack | null>(null);
  const radioBusyRef = useRef<MusicTrack | null>(null); // 補充中の seed（同じ seed では同時に1本だけ）
  const radioLastRefillAtRef = useRef(0);
  const recentIdsRef = useRef<string[]>([]); // 直近に再生した曲（最大50）
  const queueRef = useRef<MusicTrack[]>([]);
  const queueIndexRef = useRef(0);
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  const chartsData = useCharts();
  const radioLatestRef = useRef({ musicTracks: [] as MusicTrack[], charts: [] as MusicTrack[], bannedTracks: [] as string[], bannedArtists: [] as string[], strictness: 'standard' as 'strict' | 'standard' | 'all' });
  const clearRadio = useCallback(() => {
    radioSeedRef.current = null;
    setRadioSeed(null);
  }, []);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState<boolean>(false);
  const [ytPlayerReady, setYtPlayerReady] = useState<boolean>(false);
  const [nowPlayingTab, setNowPlayingTab] = useState<'video' | 'lyrics' | 'art' | 'queue'>('art');
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  // ユーザーが決めた音量（0〜100）。再生側が「音を戻す」処理をするときも、この値を使う（iPhoneではWebから変えられない）
  const userVolumeRef = useRef<number>(100);
  const lastVolStatRef = useRef<string>('');
  const [volume, setVolumeState] = useState<number>(100);
  const setVolume = useCallback((v: number) => {
    const nv = Math.max(0, Math.min(100, Math.round(v)));
    userVolumeRef.current = nv;
    setVolumeState(nv);
    try {
      ytPlayerRef.current?.setVolume?.(nv);
    } catch (e) {}
  }, []);
  const [isPlayerMuted, setIsPlayerMuted] = useState<boolean>(false);

  // New States: Lyrics offset, lyrics display mode, artwork ratio, retro mode, cloud sync
  const [lyricsOffset, setLyricsOffset] = useState<number>(0);
  const [lyricsDisplayMode, setLyricsDisplayModeState] = useState<LyricsDisplayMode>(() => {
    try {
      const saved = localStorage.getItem('melotrace_lyrics_mode_v1');
      if (saved === 'static' || saved === 'dynamic') return saved as LyricsDisplayMode;
    } catch (e) {}
    return 'dynamic';
  });
  const [artworkAspectRatio, setArtworkAspectRatioState] = useState<ArtworkAspectRatio>(() => {
    try {
      const saved = localStorage.getItem('melotrace_artwork_ratio_v1');
      if (saved === 'auto' || saved === '1:1' || saved === '16:9') return saved as ArtworkAspectRatio;
    } catch (e) {}
    return 'auto';
  });
  const [isRetroPlayerOpen, setIsRetroPlayerOpen] = useState<boolean>(false);
  const [retroPlayerSkin, setRetroPlayerSkin] = useState<'ipod' | 'walkman'>('ipod');
  const [isBgGuideOpen, setIsBgGuideOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('melotrace_user_account_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [recordYtHistory, setRecordYtHistoryState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(YT_HISTORY_KEY) === 'true';
    } catch (e) {
      return false;
    }
  });

  const ytPlayerRef = useRef<any>(null);
  const pendingTrackRef = useRef<MusicTrack | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveErrorsRef = useRef<number>(0);
  const nextTrackRef = useRef<() => void>(() => {});
  const handleTrackEndedRef = useRef<() => void>(() => {});
  const currentTrackRef = useRef<MusicTrack | null>(currentTrack);
  const playbackRateRef = useRef<number>(playbackRate);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const isAdPlayingRef = useRef<boolean>(false);
  const [playbackHint, setPlaybackHintRaw] = useState<string | null>(null);
  const [playbackHintLink, setPlaybackHintLink] = useState<string | null>(null);
  const setPlaybackHint = useCallback((msg: string | null, link?: string | null) => {
    setPlaybackHintRaw(msg);
    setPlaybackHintLink(msg ? link ?? null : null);
  }, []);
  const [keepAliveEnabled, setKeepAliveEnabledState] = useState<boolean>(() => audioKeepAlive.isEnabled());
  const [themeId, setThemeIdState] = useState<string>(() => getSavedThemeId());
  const [artworkSource, setArtworkSourceState] = useState<'album' | 'youtube'>(() => {
    try {
      return localStorage.getItem('melotrace_artwork_source_v1') === 'youtube' ? 'youtube' : 'album';
    } catch (e) {
      return 'album';
    }
  });
  const [artVersion, setArtVersion] = useState(0);
  const [playMetrics, setPlayMetrics] = useState<PlayMetric[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('melotrace_play_metrics_v1') || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  });
  const metricRef = useRef<{ id: string; title: string; tapAt: number; adStartedAt: number; adMs: number; done: boolean; auto: boolean; hidden: boolean; mode: string } | null>(null);
  const autoAdvanceRef = useRef<boolean>(false);
  const lastVisChangeRef = useRef<number>(0);
  const videoVisibleRef = useRef<boolean>(false);
  const wantPlayingRef = useRef<boolean>(false); // 「再生したい」意思（ユーザーが止めない限り true）
  const loadSeqRef = useRef<number>(0);
  const loadedAtRef = useRef<number>(0);
  const adStrikeRef = useRef<number>(0);
  const adSinceRef = useRef<number>(0);
  const adGiveUpRef = useRef<boolean>(false);
  const watchdogTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const tickCountRef = useRef<number>(0);
  const playbackLogRef = useRef<string[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [playWait, setPlayWait] = useState<{ phase: 'idle' | 'loading' | 'slow' | 'ad' | 'retry'; ms: number }>({ phase: 'idle', ms: 0 });
  const waitStartRef = useRef<number>(0);
  const retryingRef = useRef<boolean>(false);
  const chimeStopRef = useRef<(() => void) | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastAdvanceAtRef = useRef<number>(0);
  const stallCountRef = useRef<number>(0);
  const mutedStartRef = useRef<boolean>(false);
  const pendingStartRef = useRef<number>(0);
  const createPlayerRef = useRef<() => void>(() => {});
  const html5ErrorCountRef = useRef<number>(0);
  const unplayableRef = useRef<Set<string>>(
    (() => {
      try {
        const v = JSON.parse(localStorage.getItem('melotrace_unplayable_v1') || '[]');
        return new Set<string>(Array.isArray(v) ? v : []);
      } catch (e) {
        return new Set<string>();
      }
    })()
  );

  useEffect(() => {
    applyTheme(themeId);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch (e) {}
  }, [themeId]);

  const setThemeId = useCallback((id: string) => setThemeIdState(id), []);
  const setKeepAliveEnabled = useCallback((v: boolean) => {
    audioKeepAlive.setEnabled(v);
    setKeepAliveEnabledState(v);
  }, []);
  const dismissPlaybackHint = useCallback(() => setPlaybackHint(null), []);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const isHydratedRef = useRef<boolean>(false);

  // Restore full library from IndexedDB if available
  useEffect(() => {
    let isMounted = true;
    Promise.all([loadTracksFromDB(), loadPlaylistsFromDB()]).then(([dbTracks, dbPls]) => {
      if (!isMounted) return;
      if (dbTracks && dbTracks.length > 0) {
        savedTracksRef.current = new Map(dbTracks.map((t) => [t.id, t])); // 保存済みの状態を覚えておく（以後は差分だけ書く）
        setTracks(dbTracks);
        setIsDemoMode(false);
      }
      if (dbPls && dbPls.length > 0) {
        setPlaylists(dbPls);
      }
      isHydratedRef.current = true;
    }).catch(() => {
      isHydratedRef.current = true;
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 小さな設定は即時にlocalStorageへ。ライブラリ全体のIndexedDB保存は重いのでまとめて(間引いて)行う
  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY_IS_DEMO, isDemoMode.toString());
      localStorage.setItem(STORAGE_KEY_BANNED_ARTISTS, JSON.stringify(bannedArtists));
      localStorage.setItem(STORAGE_KEY_BANNED_TRACKS, JSON.stringify(bannedTracks));
      localStorage.setItem(STORAGE_KEY_STRICTNESS, strictnessMode);
    } catch (e) {
      console.warn('LocalStorage quota guarded:', e);
    }
  }, [isDemoMode, bannedArtists, bannedTracks, strictnessMode]);

  const persistTracksRef = useRef(tracks);
  persistTracksRef.current = tracks;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTracksRef = useRef<Map<string, MusicTrack>>(new Map());
  const flushTracks = useCallback(() => {
    const list = persistTracksRef.current;
    // 再生回数や歌詞などの小さな変更のたびに全曲を書き直すと重いので、変わった曲だけを書き込む
    const saved = savedTracksRef.current;
    const changed: MusicTrack[] = [];
    let seen = 0;
    for (const t of list) {
      if (saved.has(t.id)) seen += 1;
      if (saved.get(t.id) !== t) changed.push(t);
    }
    const removed = saved.size - seen;
    if (saved.size === 0 || removed > 0 || changed.length > list.length * 0.4) {
      saveTracksToDB(list);
    } else {
      putTracksToDB(changed);
    }
    if (changed.length > 0 || removed > 0) savedTracksRef.current = new Map(list.map((t) => [t.id, t]));
    try {
      // 起動を速くするための小さなキャッシュ（歌詞は含めない）
      const cacheSubset = list.slice(0, 300).map((t) => ({ ...t, lyrics: undefined }));
      localStorage.setItem(STORAGE_KEY_TRACKS, JSON.stringify(cacheSubset));
    } catch (e) {
      console.warn('LocalStorage quota guarded:', e);
    }
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current) return; // PREVENT WIPING DATABASE ON INITIAL RENDER!
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const ric = (window as any).requestIdleCallback;
      if (ric) ric(flushTracks, { timeout: 5000 });
      else flushTracks();
    }, 3000);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [tracks, flushTracks]);

  // 画面を閉じる/バックグラウンドに行くタイミングで未保存分を書き出す
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && isHydratedRef.current) flushTracks();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flushTracks]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    savePlaylistsToDB(playlists);
    try {
      localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
    } catch (e) {
      console.warn('Failed to save playlists to localStorage', e);
    }
  }, [playlists]);

  // Persist current track & queue (capped)
  useEffect(() => {
    if (currentTrack) {
      try {
        localStorage.setItem(STORAGE_KEY_LAST_TRACK_ID, currentTrack.id);
      } catch (e) {}
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    if (queue.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_LAST_QUEUE_IDS, JSON.stringify(queue.slice(0, 100).map((t) => t.id)));
      } catch (e) {}
    }
  }, [queue]);

  // 再生位置などの保存（10秒ごと／一時停止／背面／曲の変更）と、復元位置のミニプレーヤー表示
  useResumePersistence({
    track: currentTrack,
    queue,
    isPlaying,
    libraryTracks: tracks,
    playerRef: ytPlayerRef,
    initial: resumeRef.current ? { seconds: resumeRef.current.seconds, duration: resumeRef.current.track.duration } : null,
  });

  // Automatic real lyrics fetch for current track if missing
  useEffect(() => {
    if (!currentTrack) return;
    // If track already has real lyrics
    if (currentTrack.lyrics && currentTrack.lyrics.trim().length > 10) {
      // If legacy fake placeholder detected, purge and re-fetch!
      if (
        currentTrack.lyrics.includes('静けさの中に響く旋律') ||
        currentTrack.lyrics.includes('胸の鼓動と重なってゆく')
      ) {
        // Purge fake lyrics
        currentTrack.lyrics = undefined;
      } else {
        return;
      }
    }

    let isMounted = true;
    setIsLoadingLyrics(true);

    // 再生開始を最優先するため、歌詞の取得は少し遅らせる
    const lyricsTimer = setTimeout(() => {
      getLyricsForTrack(
        currentTrack.artist,
        currentTrack.title,
        currentTrack.duration || 240,
        currentTrack.id
      )
        .then((lrc) => {
          if (!isMounted) return;
          setIsLoadingLyrics(false);
          if (lrc) {
            setCurrentTrack((prev) => (prev && prev.id === currentTrack.id ? { ...prev, lyrics: lrc } : prev));
            setTracks((prev) =>
              prev.map((t) => (t.id === currentTrack.id ? { ...t, lyrics: lrc } : t))
            );
          }
        })
        .catch(() => {
          if (isMounted) setIsLoadingLyrics(false);
        });
    }, 1500);

    return () => {
      isMounted = false;
      clearTimeout(lyricsTimer);
    };
  }, [currentTrack?.id]);

  // Handle Track End
  const handleTrackEnded = useCallback(() => {
    if (repeatMode === 'one') {
      if (ytPlayerRef.current?.seekTo) {
        ytPlayerRef.current.seekTo(0, true);
        ytPlayerRef.current.playVideo();
      }
      return;
    }
    if (queue.length === 0) return;
    const nextIdx = pickPlayableIndex(queue, queueIndex, 1, shouldShuffleNext(isShuffle, !!radioSeedRef.current), unplayableRef.current);
    setQueueIndex(nextIdx);
    const nextT = queue[nextIdx];
    if (nextT) {
      autoAdvanceRef.current = true; // 自動で次の曲へ（計測用）
      playTrack(nextT, queue, false);
    }
  }, [repeatMode, queue, queueIndex, isShuffle]);

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
  }, [handleTrackEnded]);

  // ---------- Artist verification / album art ----------
  const setArtistFilterMode = useCallback((m: 'all' | 'official') => {
    setArtistFilterModeState(m);
    try {
      localStorage.setItem('melotrace_artist_filter_v1', m);
    } catch (e) {}
  }, []);

  const artistStatus = useCallback(
    (artist: string): 'verified' | 'unverified' | 'unknown' => getArtistStatus(artist) ?? 'unknown',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verifyVersion]
  );

  const setArtistOverride = useCallback((artist: string, v: 'official' | 'exclude' | null) => {
    setArtistOverrideStore(artist, v);
    setVerifyVersion((n) => n + 1);
  }, []);

  // バックグラウンドで、再生回数の多いアーティストから順に「実在するか」を判定する（結果は端末に保存）
  const verifierRunRef = useRef(0);
  useEffect(() => {
    if (isDemoMode || tracks.length === 0 || powerMode === 'on') return;
    const runId = ++verifierRunRef.current;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const timer = setTimeout(async () => {
      const totals = new Map<string, number>();
      for (const t of tracks) {
        if (t.isDemo) continue;
        totals.set(t.artist, (totals.get(t.artist) || 0) + (t.playCount || 1));
      }
      const names = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      // 電池と通信の節約: 「公式アーティストのみ」を使っていない間は、1回の起動で最大60組までにする
      const all = names.filter(artistNeedsCheck);
      const pending = artistFilterMode === 'official' ? all : all.slice(0, 60);
      let done = names.length - pending.length;
      setVerifyProgress({ done, total: names.length });
      let sinceUpdate = 0;
      let failures = 0;
      for (const name of pending) {
        if (cancelled || runId !== verifierRunRef.current) return;
        // 再生開始を最優先: 曲を読み込んでいる間・画面が見えていない間は待つ
        while (!cancelled && (document.visibilityState === 'hidden' || Date.now() - loadedAtRef.current < 8000)) {
          await sleep(2000);
        }
        const st = await verifyArtist(name);
        if (st) {
          done += 1;
          failures = 0;
          sinceUpdate += 1;
          if (sinceUpdate >= 8) {
            sinceUpdate = 0;
            setVerifyVersion((n) => n + 1);
            setVerifyProgress({ done, total: names.length });
          }
        } else {
          failures += 1;
          if (failures >= 5) {
            failures = 0;
            await sleep(60000);
          }
        }
      }
      if (!cancelled && runId === verifierRunRef.current) {
        setVerifyVersion((n) => n + 1);
        setVerifyProgress({ done, total: names.length });
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tracks.length, isDemoMode, powerMode, artistFilterMode]);

  const setArtworkSource = useCallback((src: 'album' | 'youtube') => {
    setArtworkSourceState(src);
    try {
      localStorage.setItem('melotrace_artwork_source_v1', src);
    } catch (e) {}
  }, []);

  const albumInflightRef = useRef<Set<string>>(new Set());
  const requestAlbumArt = useCallback((track: MusicTrack | null | undefined, priority: 'high' | 'low' = 'high') => {
    if (!track || track.isDemo) return;
    if (getCachedArt(track.id).state !== 'unknown') return;
    if (albumInflightRef.current.has(track.id)) return;
    albumInflightRef.current.add(track.id);
    findAlbumArt(track.id, track.title, track.artist, priority)
      .then(() => setArtVersion((n) => n + 1))
      .catch(() => {})
      .finally(() => albumInflightRef.current.delete(track.id));
  }, []);

  const retryAlbumArt = useCallback(
    (track: MusicTrack) => {
      try {
        const raw = JSON.parse(localStorage.getItem('melotrace_album_art_v1') || '{}');
        delete raw[track.id];
        localStorage.setItem('melotrace_album_art_v1', JSON.stringify(raw));
      } catch (e) {}
      // 読み込み済みキャッシュも破棄するため、モジュール側に再取得させる
      forgetArt(track.id);
      requestAlbumArt(track, 'high');
    },
    [requestAlbumArt]
  );

  const albumArtFor = useCallback(
    (trackId: string) => {
      const c = getCachedArt(trackId);
      return c.state === 'found' ? c.art : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artVersion]
  );
  const albumArtState = useCallback(
    (trackId: string): 'found' | 'none' | 'unknown' => getCachedArt(trackId).state,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artVersion]
  );

  // 再生中の曲と、次に流れる曲のジャケットを先読みする（再生開始を邪魔しないよう少し待つ）
  useEffect(() => {
    if (!currentTrack || artworkSource !== 'album') return;
    const timer = setTimeout(() => {
      requestAlbumArt(currentTrack, 'high');
      for (let i = 1; i <= 2; i++) {
        if (queue.length > 1) requestAlbumArt(queue[(queueIndex + i) % queue.length], 'low');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [currentTrack?.id, queueIndex, artworkSource, requestAlbumArt]);

  // ロック画面・コントロールセンターの画像も、ジャケットがあればそちらにする
  useEffect(() => {
    if (!currentTrack) return;
    const art = artworkSource === 'album' ? albumArtFor(currentTrack.id) : null;
    audioKeepAlive.setArtwork(art ? art.url : null);
    if (isPlayingRef.current) audioKeepAlive.onPlay(currentTrack);
  }, [currentTrack?.id, artworkSource, artVersion]);

  useEffect(() => {
    videoVisibleRef.current = isNowPlayingOpen && nowPlayingTab === 'video';
  }, [isNowPlayingOpen, nowPlayingTab]);

  // 再生開始までの時間を記録（診断用）
  const recordMetricIfReady = useCallback(() => {
    const m = metricRef.current;
    const p = ytPlayerRef.current;
    if (!m || m.done || !p) return;
    let vid: string | undefined;
    let st = -2;
    try {
      vid = p.getVideoData?.()?.video_id;
      st = p.getPlayerState?.();
    } catch (e) {}
    if (st !== 1 || vid !== m.id || isAdPlayingRef.current) return;
    m.done = true;
    const ms = Math.round(performance.now() - m.tapAt);
    const entry: PlayMetric = { id: m.id, title: m.title, ms, adMs: Math.round(m.adMs), at: new Date().toISOString(), auto: m.auto, hidden: m.hidden, mode: m.mode };
    setPlayMetrics((prev) => {
      const next = [entry, ...prev].slice(0, 20);
      try {
        localStorage.setItem('melotrace_play_metrics_v1', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  // ---------- Playback robustness helpers ----------
  // 待ち時間の見える化: 「読み込み中 → 少し時間がかかっている → 広告中 → 再接続中」を判定して、画面とキャラクターに伝える
  const beginWaiting = useCallback(() => {
    waitStartRef.current = performance.now();
    retryingRef.current = false;
    setPlayWait({ phase: 'loading', ms: 0 }); // 押した瞬間から「読み込み中」を見せる
    setIsWaiting(true);
  }, []);
  const endWaiting = useCallback(() => {
    setIsWaiting(false);
  }, []);
  useEffect(() => {
    if (!isWaiting) {
      setPlayWait((w) => (w.phase === 'idle' ? w : { phase: 'idle', ms: 0 }));
      if (chimeStopRef.current) {
        chimeStopRef.current();
        chimeStopRef.current = null;
      }
      return;
    }
    const id = setInterval(() => {
      const ms = performance.now() - waitStartRef.current;
      const phase = isAdPlayingRef.current ? 'ad' : retryingRef.current ? 'retry' : ms > 4500 ? 'slow' : 'loading';
      setPlayWait((w) => (w.phase === phase && Math.abs(w.ms - ms) < 900 ? w : { phase, ms }));
      // 少し待たされているときだけ、やさしい音を鳴らす
      if (ms > 2200 && !chimeStopRef.current) chimeStopRef.current = startWaitChime();
    }, 400);
    return () => clearInterval(id);
  }, [isWaiting]);

  // ---------- 再生の詳細ログ（不具合調査用・端末内のみ） ----------
  const logEvent = useCallback((msg: string) => {
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    const arr = playbackLogRef.current;
    arr.push(`${t} ${msg}`);
    if (arr.length > 150) arr.splice(0, arr.length - 150);
  }, []);
  const getPlaybackLog = useCallback(() => [...playbackLogRef.current], []);
  const clearPlaybackLog = useCallback(() => {
    playbackLogRef.current = [];
  }, []);
  const isUnplayable = useCallback((id: string) => unplayableRef.current.has(id), []);
  const markUnplayable = useCallback((id: string, on: boolean) => {
    const set = unplayableRef.current;
    if (on === set.has(id)) return;
    if (on) set.add(id);
    else set.delete(id);
    try {
      localStorage.setItem('melotrace_unplayable_v1', JSON.stringify(Array.from(set).slice(-500)));
    } catch (e) {}
  }, []);

  /** 固まったYouTubeプレーヤーを作り直す（長時間の放置やバックグラウンド後に効くことがある） */
  const recreatePlayer = useCallback(
    (trackId: string | null, startSec = 0) => {
      logEvent(`プレーヤーを作り直し (${trackId ?? '-'}, ${Math.round(startSec)}s)`);
      const old = ytPlayerRef.current;
      try {
        old?.destroy?.();
      } catch (e) {}
      ytPlayerRef.current = null;
      setYtPlayerReady(false);
      const wrapper = document.getElementById('yt-player-wrapper');
      if (wrapper) {
        wrapper.innerHTML = '';
        const d = document.createElement('div');
        d.id = 'yt-player-target';
        d.className = 'w-full h-full';
        wrapper.appendChild(d);
      }
      if (trackId && currentTrackRef.current) {
        pendingTrackRef.current = currentTrackRef.current.id === trackId ? currentTrackRef.current : { ...currentTrackRef.current, id: trackId };
        pendingStartRef.current = startSec;
      }
      createPlayerRef.current();
    },
    [logEvent]
  );

  const restartPlayer = useCallback(() => {
    const t = currentTrackRef.current;
    wantPlayingRef.current = !!t;
    loadSeqRef.current += 1;
    loadedAtRef.current = Date.now();
    recreatePlayer(t ? t.id : null, lastTimeRef.current || 0);
    if (t) {
      setIsPlaying(true);
      setIsBuffering(true);
    }
  }, [recreatePlayer]);

  // YouTubeのAPIスクリプトが読み込めていない場合は、数回読み込み直す
  useEffect(() => {
    const retry = () => {
      if ((window as any).YT?.Player) return;
      logEvent('YouTube API 未読込 → スクリプトを再読み込み');
      const s2 = document.createElement('script');
      s2.src = 'https://www.youtube.com/iframe_api?retry=' + Date.now();
      s2.async = true;
      document.head.appendChild(s2);
    };
    const t1 = setTimeout(retry, 8000);
    const t2 = setTimeout(() => {
      retry();
      if (!(window as any).YT?.Player) setPlaybackHint('YouTubeのプレーヤーを読み込めていません。通信状況を確認してください。');
    }, 20000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [logEvent, setPlaybackHint]);

  const clearWatchdog = useCallback(() => {
    watchdogTimersRef.current.forEach((t) => clearTimeout(t));
    watchdogTimersRef.current = [];
  }, []);

  /**
   * 広告判定。読み込み直後は getVideoData() が前の動画IDのままのことがあり、
   * 以前は「広告」と誤判定 → ミュート・時間停止（音が出ない／止まったまま）の原因になっていた。
   * そのため (1)読み込み後1.2秒は判定しない (2)2回連続で不一致のときだけ広告扱い (3)45秒続いたら誤判定とみなして解除する。
   */
  const evaluateAd = useCallback((): boolean => {
    const p = ytPlayerRef.current;
    const cur = currentTrackRef.current?.id;
    if (!p || !cur || adGiveUpRef.current) return false;
    let vid: string | undefined;
    try {
      vid = p.getVideoData?.()?.video_id;
    } catch (e) {}
    if (!vid || vid === cur) {
      adStrikeRef.current = 0;
      adSinceRef.current = 0;
      return false;
    }
    if (Date.now() - loadedAtRef.current < 1200) return false;
    adStrikeRef.current += 1;
    if (adStrikeRef.current < 2) return false;
    if (!adSinceRef.current) adSinceRef.current = Date.now();
    if (Date.now() - adSinceRef.current > 45000) {
      adGiveUpRef.current = true; // 広告ではなく別IDで再生されている動画とみなす
      return false;
    }
    return true;
  }, []);

  const applyAdState = useCallback((isAd: boolean) => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try {
      if (isAd) {
        if (!isAdPlayingRef.current) {
          isAdPlayingRef.current = true;
          setIsAdPlaying(true);
          setIsBuffering(true);
          setCurrentTime(0);
          if (metricRef.current && !metricRef.current.adStartedAt) metricRef.current.adStartedAt = performance.now();
          logEvent('広告を検知');
        }
        p.mute?.();
        p.setPlaybackRate?.(2);
      } else {
        if (isAdPlayingRef.current) {
          isAdPlayingRef.current = false;
          setIsAdPlaying(false);
          setIsBuffering(false);
          p.setPlaybackRate?.(playbackRateRef.current);
          if (metricRef.current && metricRef.current.adStartedAt) {
            metricRef.current.adMs += performance.now() - metricRef.current.adStartedAt;
            metricRef.current.adStartedAt = 0;
          }
          logEvent('広告が終了');
        }
        // 広告中でなければ常に音が出る状態にする（ミュートのまま残る不具合の対策）
        if (p.isMuted?.()) {
          p.unMute?.();
          p.setVolume?.(userVolumeRef.current);
        }
      }
    } catch (e) {}
  }, [logEvent]);

  /** 再生開始の見張り: 一定時間たっても再生が始まらなければ段階的に再試行し、最終的にはユーザーに▶操作を促す */
  const startWatchdog = useCallback(
    (id: string) => {
      clearWatchdog();
      const mySeq = loadSeqRef.current;
      // ログの分析: プレーヤーを自動で作り直すと、新しい映像要素は「ユーザーのタップ」が無いと再生を始められず、
      // かえって止まる。そのため自動での作り直しはやめ、長引く場合は早めにタップを促す。
      const steps: Array<[number, 'kick' | 'reload' | 'muted' | 'recreate' | 'giveup']> = [
        [1800, 'kick'],
        [4800, 'reload'],
        [8500, 'muted'],
        [12000, 'giveup'],
      ];
      steps.forEach(([ms, action]) => {
        watchdogTimersRef.current.push(
          setTimeout(() => {
            if (mySeq !== loadSeqRef.current || !wantPlayingRef.current) return;
            const p = ytPlayerRef.current;
            if (!p) {
              if (action === 'recreate') recreatePlayer(id, 0);
              return;
            }
            if (isAdPlayingRef.current) return; // 広告再生中は待つ
            let st = -2;
            try {
              st = p.getPlayerState?.();
            } catch (e) {}
            if (st === 1) return; // 再生中
            logEvent(`見張り: ${action} (状態 ${st})`);
            try {
              if (action === 'kick') {
                p.unMute?.();
                p.playVideo?.();
              } else if (action === 'reload') {
                if (st === 3) return; // 通信中は待つ
                retryingRef.current = true;
                p.loadVideoById({ videoId: id, startSeconds: 0 });
                p.playVideo?.();
              } else if (action === 'muted') {
                if (st === 3) return;
                retryingRef.current = true;
                // 自動再生が拒否されている場合の最終手段: ミュートで開始（ミュート再生は許可されやすい）→再生後に音を戻す
                mutedStartRef.current = true;
                p.mute?.();
                p.loadVideoById({ videoId: id, startSeconds: 0 });
                p.playVideo?.();
              } else if (action === 'recreate') {
                retryingRef.current = true;
                recreatePlayer(id, 0);
              } else {
                setIsPlaying(false);
                setIsBuffering(false);
                setIsWaiting(false);
                setPlaybackHint('読み込みが長引いています。▶をタップすると、すぐ始まることがあります。', `https://www.youtube.com/watch?v=${id}`);
              }
            } catch (e) {}
          }, ms)
        );
      });
    },
    [clearWatchdog, recreatePlayer, logEvent, setPlaybackHint]
  );

  const resumePlayback = useCallback(() => {
    logEvent('再生/再開 操作');
    primeChime();
    wantPlayingRef.current = true;
    setPlaybackHint(null);
    const p = ytPlayerRef.current;
    // 復元した位置からの最初の再生: その位置から読み込む（再生ログはここで初めて書く）
    const rs = resumeStartRef.current;
    const cur = currentTrackRef.current;
    resumeStartRef.current = null;
    if (rs && cur && rs.id === cur.id) {
      appendPlayLog(cur.id, cur.isRadio ? 'radio' : persistTracksRef.current.some((t) => t.id === cur.id) ? 'library' : 'other');
      lastTimeRef.current = rs.sec;
      loadedAtRef.current = Date.now();
      if (p?.loadVideoById) {
        try {
          p.unMute?.();
          p.setVolume?.(userVolumeRef.current);
          p.loadVideoById({ videoId: cur.id, startSeconds: rs.sec });
          p.playVideo?.();
        } catch (e) {}
      } else {
        pendingTrackRef.current = cur;
        pendingStartRef.current = rs.sec;
      }
    } else
    try {
      p?.unMute?.();
      p?.setVolume?.(userVolumeRef.current);
      p?.playVideo?.();
    } catch (e) {}
    setIsPlaying(true);
    audioKeepAlive.onPlay(currentTrackRef.current);
    if (currentTrackRef.current) startWatchdog(currentTrackRef.current.id);
  }, [startWatchdog, logEvent]);

  const pausePlayback = useCallback(() => {
    logEvent('一時停止 操作');
    setIsWaiting(false);
    wantPlayingRef.current = false;
    clearWatchdog();
    try {
      ytPlayerRef.current?.pauseVideo?.();
    } catch (e) {}
    setIsPlaying(false);
    setIsBuffering(false);
    audioKeepAlive.onPause();
  }, [clearWatchdog, logEvent]);

  // 画面復帰時にUI状態を実際のプレイヤー状態へ合わせる（止まっているのに再生中表示、を防ぐ）
  useEffect(() => {
    const onVisible = () => {
      lastVisChangeRef.current = Date.now();
      if (document.visibilityState !== 'visible') return;
      const p = ytPlayerRef.current;
      if (!p?.getPlayerState) return;
      try {
        const st = p.getPlayerState();
        const playingNow = st === 1 || st === 3;
        // 画面復帰直後に一時停止状態を検知しても、再生したい意思があるなら表示を変えずにすぐ再開する（途切れを最小化）
        logEvent(`画面${document.visibilityState === 'visible' ? '復帰' : '非表示'} 状態=${st}`);
        if (!playingNow && wantPlayingRef.current && (st === -1 || st === 5) && currentTrackRef.current) {
          // 一度も再生が始まっていない/プレーヤーが初期状態に戻っている: 位置を保って読み込み直す
          p.loadVideoById({ videoId: currentTrackRef.current.id, startSeconds: lastTimeRef.current || 0 });
        } else if (!playingNow && wantPlayingRef.current) {
          p.playVideo?.();
        } else {
          setIsPlaying((prev) => (prev === playingNow ? prev : playingNow));
        }
        if (!isAdPlayingRef.current && p.isMuted?.()) {
          p.unMute?.();
          p.setVolume?.(userVolumeRef.current);
        }
      } catch (e) {}
    };
    const onHidden = () => {
      lastVisChangeRef.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('pagehide', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('pagehide', onHidden);
    };
  }, []);

  // iOSアプリ: アプリを離れた直後にシステム都合で止められたら、自動で再生を再開する
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    setupNativeBackgroundResume({
      isWanted: () => wantPlayingRef.current,
      getState: () => ytPlayerRef.current?.getPlayerState?.(),
      getTime: () => {
        try {
          return Number(ytPlayerRef.current?.getCurrentTime?.()) || 0;
        } catch (e) {
          return 0;
        }
      },
      resume: () => {
        try {
          ytPlayerRef.current?.playVideo?.();
        } catch (e) {}
      },
      reload: (startSeconds: number) => {
        try {
          const id = currentTrackRef.current?.id;
          if (id) ytPlayerRef.current?.loadVideoById?.({ videoId: id, startSeconds });
        } catch (e) {}
      },
      onStateChange: () => {
        lastVisChangeRef.current = Date.now();
      },
      log: logEvent,
    }).then((c) => {
      if (disposed) c();
      else cleanup = c;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [logEvent]);

  // Initialize YouTube IFrame Player
  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 200);
        return;
      }

      if (ytPlayerRef.current) return;

      const container = document.getElementById('yt-player-target');
      if (!container) {
        setTimeout(initPlayer, 200);
        return;
      }

      try {
        logEvent('プレーヤー作成');
        ytPlayerRef.current = new window.YT.Player('yt-player-target', {
          height: '100%',
          width: '100%',
          videoId: currentTrack?.id || 'ZRtdQ81jPUQ',
          host: (() => {
            try {
              return localStorage.getItem(YT_HISTORY_KEY) === 'true' ? 'https://www.youtube.com' : 'https://www.youtube-nocookie.com';
            } catch (e) {
              return 'https://www.youtube-nocookie.com';
            }
          })(),
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            controls: 0,
            disablekb: 1,
            cc_load_policy: 0,
            enablejsapi: 1,
            iv_load_policy: 3,
            fs: 0,
            origin: window.location.origin,
            widget_referrer: window.location.href,
            hl: 'ja',
          },
          events: {
            onReady: () => {
              setYtPlayerReady(true);
              if (pendingTrackRef.current) {
                const p = pendingTrackRef.current;
                pendingTrackRef.current = null;
                try {
                  ytPlayerRef.current.loadVideoById({ videoId: p.id, startSeconds: pendingStartRef.current || 0 });
                  ytPlayerRef.current.playVideo?.();
                  pendingStartRef.current = 0;
                } catch (e) {
                  console.warn('onReady loadVideoById failed', e);
                }
              }
            },
            onStateChange: (event: any) => {
              // 1: PLAYING, 2: PAUSED, 0: ENDED, 3: BUFFERING, -1: UNSTARTED, 5: CUED
              const p = ytPlayerRef.current;
              logEvent(`状態 ${event.data}`);
              if (event.data === 1) {
                // 字幕は常にオフにする（YouTubeアカウント側の設定で自動表示されるのを防ぐ）
                try {
                  p?.unloadModule?.('captions');
                  p?.unloadModule?.('cc');
                } catch (e) {}
                // 音量の診断: YouTube側の音量補正（「100% / 72%」のような表示）が変わったときだけ、再生ログに残す
                try {
                  const sn = p?.getStatsForNerds?.();
                  const v = sn?.volume ?? sn?.Volume;
                  if (v && String(v) !== lastVolStatRef.current) {
                    lastVolStatRef.current = String(v);
                    logEvent(`音量: ${String(v)}`);
                  }
                } catch (e) {}
                setIsPlaying(true);
                consecutiveErrorsRef.current = 0;
                html5ErrorCountRef.current = 0;
                const isAd = evaluateAd();
                applyAdState(isAd);
                try {
                  logEvent(`状態1: 動画=${p?.getVideoData?.()?.video_id ?? '?'} 曲=${currentTrackRef.current?.id ?? '?'} 広告=${isAd}`);
                } catch (e) {}
                if (!isAd) {
                  endWaiting();
                  if (currentTrackRef.current) markUnplayable(currentTrackRef.current.id, false);
                  if (mutedStartRef.current) {
                    // ミュートで始めた場合: 音を戻す。ブラウザに止められたら、タップを促す
                    mutedStartRef.current = false;
                    try {
                      p?.unMute?.();
                      p?.setVolume?.(userVolumeRef.current);
                    } catch (e) {}
                    setTimeout(() => {
                      let st2 = -2;
                      try {
                        st2 = ytPlayerRef.current?.getPlayerState?.();
                      } catch (e) {}
                      if (st2 !== 1 && st2 !== 3) {
                        logEvent('ミュート解除後に停止 → タップ待ち');
                        setIsPlaying(false);
                        setPlaybackHint('音を出すには▶をタップしてください。');
                      }
                    }, 1500);
                  }
                  recordMetricIfReady();
                  clearWatchdog();
                  setPlaybackHint(null);
                  setIsBuffering(false);
                  try {
                    const d = p?.getDuration?.();
                    if (d && !isNaN(d) && d > 0) setDuration(d);
                  } catch (e) {}
                  audioKeepAlive.startLoop();
                }
              } else if (event.data === 2) {
                // 読み込み直後に勝手に止められた場合（自動再生ブロック等）は、UIは再生中のまま再開を試みる
                const recentlyLoaded = Date.now() - loadedAtRef.current < 8000;
                const aroundVisibilityChange = Date.now() - lastVisChangeRef.current < 3000; // アプリを離れる/戻る前後のシステム都合の一時停止
                if (wantPlayingRef.current && (recentlyLoaded || aroundVisibilityChange)) {
                  try {
                    p?.playVideo?.();
                  } catch (e) {}
                  return;
                }
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (event.data === 0) {
                setIsBuffering(false);
                const vData = p?.getVideoData?.();
                if (vData?.video_id && currentTrackRef.current?.id && vData.video_id !== currentTrackRef.current.id) {
                  // 広告が終わっただけ。曲はこれから始まるので次曲へは進めない
                  isAdPlayingRef.current = false;
                  setIsAdPlaying(false);
                  try {
                    p?.unMute?.();
                  } catch (e) {}
                  return;
                }
                const curTime = p?.getCurrentTime?.() || 0;
                const dur = p?.getDuration?.() || 0;
                if (dur > 30 && curTime < dur - 5) {
                  return; // 広告→本編の切り替え時の誤ENDEDは無視
                }
                isAdPlayingRef.current = false;
                setIsAdPlaying(false);
                try {
                  p?.unMute?.();
                } catch (e) {}
                handleTrackEndedRef.current();
              } else if (event.data === 3) {
                setIsBuffering(true);
              } else if (event.data === -1 || event.data === 5) {
                setIsBuffering(false);
              }
            },
            onError: (err: any) => {
              const errCode = err?.data;
              logEvent(`エラー ${errCode}`);
              setIsWaiting(false);
              console.warn('YouTube Player Error Code:', errCode);
              clearWatchdog();
              setIsBuffering(false);
              setIsAdPlaying(false);
              isAdPlayingRef.current = false;
              try {
                ytPlayerRef.current?.unMute?.();
              } catch (e) {}
              const cur = currentTrackRef.current;
              const ytLink = cur ? `https://www.youtube.com/watch?v=${cur.id}` : null;

              // 5: プレーヤー内部エラー → 続くようなら作り直す
              if (errCode === 5) {
                html5ErrorCountRef.current += 1;
                if (html5ErrorCountRef.current >= 2 && cur) {
                  html5ErrorCountRef.current = 0;
                  recreatePlayer(cur.id, lastTimeRef.current || 0);
                  return;
                }
              }
              // 100: 動画が存在しない/非公開, 101・150: 埋め込み再生が許可されていない, 2: 不正なパラメータ
              if ([2, 5, 100, 101, 150].includes(errCode)) {
                if (cur && [100, 101, 150].includes(errCode)) markUnplayable(cur.id, true);
                const reason =
                  errCode === 101 || errCode === 150
                    ? 'この動画は、投稿者の設定によりアプリ内で再生できません。'
                    : errCode === 100
                    ? 'この動画は削除または非公開になっています。'
                    : '再生できない動画でした。';
                if (consecutiveErrorsRef.current < 2) {
                  consecutiveErrorsRef.current += 1;
                  setPlaybackHint(`${reason}次の曲へ進みます。`, ytLink);
                  setTimeout(() => nextTrackRef.current(), 900);
                } else {
                  wantPlayingRef.current = false;
                  setPlaybackHint(`${reason}再生できない曲が続いたため停止しました。▶で再開できます。`, ytLink);
                  setIsPlaying(false);
                  consecutiveErrorsRef.current = 0;
                }
              }
            },
          },
        });
      } catch (e) {
        console.error('Failed to init YT player:', e);
      }
    };

    createPlayerRef.current = initPlayer;
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      const t = setTimeout(initPlayer, 500);
      return () => clearTimeout(t);
    }
  }, []);

  // Poll real playback time & monitor ad state (間隔は用途に応じて可変: 歌詞表示中は細かく、それ以外は粗く = 再描画と電力を節約)
  // 画面が見えているか・何を表示しているかで間隔を変えて、無駄な処理（と電池）を減らす
  const lowPower = powerMode === 'on';
  const pollMs = isHiddenPage
    ? 2500 // ロック中・別アプリ表示中: 広告の検知と再生の見張りだけ
    : isNowPlayingOpen && nowPlayingTab === 'lyrics'
    ? lowPower ? 500 : 250 // 歌詞の同期には細かい更新が必要
    : isNowPlayingOpen
    ? 500
    : lowPower ? 1500 : 1000; // ミニプレイヤーの細い進行バーだけなら1秒ごとで十分
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        const isAd = evaluateAd();
        applyAdState(isAd);
        if (isAd) return; // 広告中は時間を進めない
        recordMetricIfReady();
        if (document.visibilityState === 'hidden') {
          // 画面が見えていない間は、表示の更新をしない（ロック画面の位置表示だけたまに更新）
          tickCountRef.current += 1;
          if (tickCountRef.current % 2 === 0) {
            const c = p.getCurrentTime();
            const d = p.getDuration();
            if (typeof c === 'number' && typeof d === 'number' && d > 0) audioKeepAlive.updatePositionState(c, d);
          }
          return;
        }

        const current = p.getCurrentTime();
        const dur = p.getDuration();
        if (typeof current === 'number' && !isNaN(current)) {
          setCurrentTime((prev) => (Math.abs(prev - current) < 0.2 ? prev : current));
          // 再生が進まないまま固まっていないかを監視（バックグラウンド中は対象外）
          const now = Date.now();
          if (Math.abs(current - lastTimeRef.current) > 0.05) {
            lastAdvanceAtRef.current = now;
            stallCountRef.current = 0;
          } else if (
            wantPlayingRef.current &&
            document.visibilityState === 'visible' &&
            lastAdvanceAtRef.current > 0 &&
            now - lastAdvanceAtRef.current > 7000 &&
            now - loadedAtRef.current > 9000
          ) {
            lastAdvanceAtRef.current = now;
            stallCountRef.current += 1;
            const tr = currentTrackRef.current;
            logEvent(`再生が進まない (${stallCountRef.current}回目) ${current.toFixed(1)}s`);
            try {
              if (stallCountRef.current === 1) {
                p.seekTo?.(current, true);
                p.playVideo?.();
              } else if (stallCountRef.current === 2 && tr) {
                p.loadVideoById({ videoId: tr.id, startSeconds: current });
                p.playVideo?.();
              } else if (tr) {
                stallCountRef.current = 0;
                setIsPlaying(false);
                setPlaybackHint('再生が止まりました。▶をタップすると続きから再開します。', `https://www.youtube.com/watch?v=${tr.id}`);
              }
            } catch (e) {}
          }
          lastTimeRef.current = current;
        }
        if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
          setDuration((prev) => (prev === dur ? prev : dur));
        }
        tickCountRef.current += 1;
        if (tickCountRef.current % Math.max(1, Math.round(1000 / pollMs)) === 0) {
          if (typeof current === 'number' && typeof dur === 'number' && dur > 0) {
            audioKeepAlive.updatePositionState(current, dur);
          }
          if (p.isMuted) setIsPlayerMuted(Boolean(p.isMuted()));
        }
      } catch (e) {
        // ignore
      }
    }, pollMs);
    return () => clearInterval(id);
  }, [isPlaying, pollMs, evaluateAd, applyAdState, recordMetricIfReady, logEvent, recreatePlayer]);

  radioLatestRef.current = { musicTracks, charts: chartsData?.tracks ?? [], bannedTracks, bannedArtists, strictness: strictnessMode };

  const playTrack = useCallback(
    (track: MusicTrack, newQueue?: MusicTrack[], shouldOpenModal: boolean = false) => {
      // 再生ログ（端末内）。ラジオ曲も残す。直前の曲の秒数もここで確定する（setCurrentTime(0) より前に呼ぶ必要がある）
      appendPlayLog(track.id, track.isRadio ? 'radio' : persistTracksRef.current.some((t) => t.id === track.id) ? 'library' : 'other');
      resumeStartRef.current = null; // 別の曲を選んだら、復元位置は使わない
      // ラジオ: 別の曲・別のリストを選んだら止める（自動で次へ進む／いまのキュー内の曲を選ぶ場合は続ける）
      if (radioSeedRef.current) {
        const cur = queueRef.current;
        const stays = autoAdvanceRef.current || ((!newQueue || newQueue === cur) && cur.some((t) => t.id === track.id));
        if (!stays) clearRadio();
      }
      recentIdsRef.current = [track.id, ...recentIdsRef.current.filter((id) => id !== track.id)].slice(0, 50);
      const isBgm = isBgmOrClassicalTrack(track);
      const defaultQ = isBgm ? bgmTracks : musicTracks.length > 0 ? musicTracks : activeTracks;
      const q = newQueue || (queue.length > 0 ? queue : defaultQ);

      if (newQueue || queue.length === 0) {
        setQueue(q);
      }
      const idx = q.findIndex((t) => t.id === track.id);
      setQueueIndex(idx >= 0 ? idx : 0);
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(track.duration || 210);
      setIsPlaying(true);
      setIsBuffering(true);
      setIsAdPlaying(false);

      // Only open full modal sheet if explicitly requested
      if (shouldOpenModal) {
        setIsNowPlayingOpen(true);
      }

      // MediaSession metadata（無音ループは再生が実際に始まってから開始する）
      audioKeepAlive.onPlay(track);

      // 再生開始: 見張り(ウォッチドッグ)付きで確実に始める
      loadSeqRef.current += 1;
      loadedAtRef.current = Date.now();
      adStrikeRef.current = 0;
      adSinceRef.current = 0;
      adGiveUpRef.current = false;
      wantPlayingRef.current = true;
      isAdPlayingRef.current = false;
      setPlaybackHint(null);

      const isAuto = autoAdvanceRef.current;
      autoAdvanceRef.current = false;
      const videoMode = getPref('melotrace_video_mode_v1', 'normal');
      metricRef.current = {
        id: track.id, title: track.title, tapAt: performance.now(), adStartedAt: 0, adMs: 0, done: false,
        auto: isAuto, hidden: document.visibilityState === 'hidden', mode: videoMode,
      };
      logEvent(`再生要求 ${track.id} 「${track.title.slice(0, 24)}」 [${metricRef.current.auto ? '自動' : '手動'}・画面${metricRef.current.hidden ? '非表示' : '表示'}・映像${metricRef.current.mode === 'quiet' ? '抑制' : '標準'}]`);
      primeChime();
      beginWaiting();
      lastTimeRef.current = 0;
      lastAdvanceAtRef.current = 0;
      stallCountRef.current = 0;
      mutedStartRef.current = false;
      html5ErrorCountRef.current = 0;

      const p = ytPlayerRef.current;
      if (p?.loadVideoById) {
        try {
          p.unMute?.();
          p.setVolume?.(userVolumeRef.current);
          // 音楽が主役なので、動画画面を開いていない間は低画質で読み込み、再生開始を速くする（無視される場合もある）
          p.loadVideoById({
            videoId: track.id,
            startSeconds: 0,
            suggestedQuality: videoVisibleRef.current ? 'default' : getPref('melotrace_video_mode_v1', 'normal') === 'quiet' ? 'tiny' : 'small',
          });
          p.playVideo?.();
        } catch (e) {
          console.warn('loadVideoById failed', e);
        }
        startWatchdog(track.id);
      } else {
        pendingTrackRef.current = track;
        startWatchdog(track.id);
      }

      // ラジオが足した曲は、ライブラリの再生回数・最終再生を動かさない
      if (!track.isRadio) {
        setTracks((prev) =>
          prev.map((t) => {
            if (t.id === track.id) {
              return {
                ...t,
                playCount: t.playCount + 1,
                lastPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
              };
            }
            return t;
          })
        );
      }
    },
    [queue, musicTracks, bgmTracks, activeTracks, startWatchdog, logEvent, beginWaiting, clearRadio]
  );

  // キューにだけ曲を足す（ライブラリには入れない）。同じIDが「いま以前」にあれば足さず、「これから」にあれば移して足す
  const appendToQueue = useCallback((newTracks: MusicTrack[], afterCurrent: boolean = false) => {
    if (!newTracks || newTracks.length === 0) return;
    const cur = queueRef.current;
    const ci = queueIndexRef.current;
    const past = new Set(cur.slice(0, ci + 1).map((t) => t.id));
    const seen = new Set<string>();
    const fresh = newTracks.filter((t) => {
      if (past.has(t.id) || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    if (fresh.length === 0) return;
    const head = cur.slice(0, ci + 1);
    const tail = cur.slice(ci + 1).filter((t) => !seen.has(t.id));
    const next = afterCurrent ? [...head, ...fresh, ...tail] : [...head, ...tail, ...fresh];
    queueRef.current = next;
    setQueue(next);
  }, []);

  // 関連曲を集めてキューへ足す。再生中に先読みで走らせる。失敗しても静かに諦める（再生は止めない）
  // replaceUpcoming=true: 現在の曲より後ろをラジオの曲だけに置き換える（開始時）／false: 末尾に足す（補充時）
  const refillRadio = useCallback(
    async (replaceUpcoming: boolean) => {
      const seed = radioSeedRef.current;
      if (!seed || radioBusyRef.current === seed) return;
      radioBusyRef.current = seed;
      radioLastRefillAtRef.current = Date.now();
      try {
        const q = queueRef.current;
        const qi = queueIndexRef.current;
        const recent = new Set<string>(recentIdsRef.current);
        for (const t of q.slice(0, qi + 1)) recent.add(t.id); // これまでに流れた曲
        if (!replaceUpcoming) for (const t of q.slice(qi + 1, qi + 51)) recent.add(t.id); // これから流れる50曲（置き換え時は捨てるので除外しない）
        const lt = radioLatestRef.current;
        const bt = new Set(lt.bannedTracks);
        const ba = new Set(lt.bannedArtists);
        const batch = await buildRadioBatch(seed, {
          library: lt.musicTracks,
          charts: lt.charts,
          newReleases: readCachedNewReleases(),
          recentIds: recent,
          unplayable: unplayableRef.current,
          isBlocked: (t) => bt.has(t.id) || ba.has(t.artist),
          prevArtist: replaceUpcoming ? undefined : q[q.length - 1]?.artist,
          strictness: lt.strictness,
        });
        if (radioSeedRef.current !== seed) return; // 待っている間に止められた／別のラジオになった
        if (replaceUpcoming) {
          const next = replaceUpcomingWithRadio(queueRef.current, queueIndexRef.current, batch);
          if (next !== queueRef.current) {
            queueRef.current = next;
            setQueue(next);
          }
        } else {
          appendToQueue(batch, false);
        }
      } catch (e) {
        // 静かに諦める
      } finally {
        if (radioBusyRef.current === seed) radioBusyRef.current = null;
      }
    },
    [appendToQueue]
  );

  const startRadio = useCallback(
    (seed: MusicTrack) => {
      radioSeedRef.current = seed;
      setRadioSeed(seed);
      void refillRadio(true); // 現在の曲より後ろをラジオの曲だけに置き換える（現在の曲と履歴は残す）
    },
    [refillRadio]
  );

  // 補充のきっかけ: キューの残りが RADIO_REFILL_REMAINING 曲以下（ラジオ中はシャッフルでも順番どおりなので共通）。曲の終了は待たない
  useEffect(() => {
    if (!radioSeed || !currentTrack || repeatMode === 'one') return;
    const due = isRadioRefillDue(queue.length, queueIndex);
    if (!due || Date.now() - radioLastRefillAtRef.current < 20000) return;
    void refillRadio(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, radioSeed, repeatMode, queue.length, queueIndex]);

  const playBgmStation = useCallback(() => {
    if (bgmTracks.length === 0) return;
    setIsShuffle(true);
    const rand = Math.floor(Math.random() * bgmTracks.length);
    playTrack(bgmTracks[rand], bgmTracks, false);
  }, [bgmTracks, playTrack]);

  const togglePlay = useCallback(() => {
    let st = -2;
    try {
      st = ytPlayerRef.current?.getPlayerState?.();
    } catch (e) {}
    // 画面上は再生中でも、実際は止まっている（▶のまま固まる状態）なら「再生を再試行」として扱う
    if (isPlayingRef.current && (st === 1 || st === 3)) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  }, [pausePlayback, resumePlayback]);

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return;
    const nextIdx = pickPlayableIndex(queue, queueIndex, 1, shouldShuffleNext(isShuffle, !!radioSeedRef.current), unplayableRef.current);
    setQueueIndex(nextIdx);
    const nextT = queue[nextIdx];
    if (nextT) {
      playTrack(nextT, queue, false);
    }
  }, [queue, queueIndex, isShuffle, playTrack]);

  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  const prevTrack = useCallback(() => {
    if (queue.length === 0) return;
    const prevIdx = pickPlayableIndex(queue, queueIndex, -1, false, unplayableRef.current);
    setQueueIndex(prevIdx);
    const prevT = queue[prevIdx];
    if (prevT) {
      playTrack(prevT, queue, false);
    }
  }, [queue, queueIndex, playTrack]);

  const seekTo = useCallback((sec: number) => {
    setCurrentTime(sec);
    // 復元後の最初の再生の前にシークしたら、その位置から始める
    if (resumeStartRef.current) resumeStartRef.current = { ...resumeStartRef.current, sec };
    if (ytPlayerRef.current?.seekTo) {
      try {
        ytPlayerRef.current.seekTo(sec, true);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (ytPlayerRef.current?.setPlaybackRate) {
      try {
        ytPlayerRef.current.setPlaybackRate(rate);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const toggleFavorite = useCallback((trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === trackId) {
          return { ...t, isFavorite: !t.isFavorite };
        }
        return t;
      })
    );
    setCurrentTrack((prev) => {
      if (prev && prev.id === trackId) {
        return { ...prev, isFavorite: !prev.isFavorite };
      }
      return prev;
    });
  }, []);

  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (minutes && minutes > 0) {
      sleepTimerRef.current = setTimeout(() => {
        wantPlayingRef.current = false;
        if (ytPlayerRef.current?.pauseVideo) {
          ytPlayerRef.current.pauseVideo();
        }
        audioKeepAlive.onPause({ immediate: true });
        setIsPlaying(false);
        setSleepTimerMinutes(null);
      }, minutes * 60 * 1000);
    }
  }, []);

  // Ban / Unban actions
  const banArtist = useCallback((artist: string) => {
    setBannedArtists((prev) => (prev.includes(artist) ? prev : [...prev, artist]));
  }, []);

  const unbanArtist = useCallback((artist: string) => {
    setBannedArtists((prev) => prev.filter((a) => a !== artist));
  }, []);

  const toggleFavoriteArtist = useCallback((artist: string) => {
    setFavoriteArtists((prev) => (prev.includes(artist) ? prev.filter((a) => a !== artist) : [...prev, artist]));
  }, []);

  /** まとめて追加（既に入っている名前は、表記ゆれも含めて重複させない） */
  const addFavoriteArtists = useCallback((names: string[]) => {
    setFavoriteArtists((prev) => {
      const seen = new Set(prev.map((a) => normalizeName(a)));
      const added: string[] = [];
      for (const n of names) {
        const key = normalizeName(n);
        if (!n || !key || seen.has(key)) continue;
        seen.add(key);
        added.push(n);
      }
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FAV_ARTISTS, JSON.stringify(favoriteArtists));
    } catch (e) {}
  }, [favoriteArtists]);

  const banTrack = useCallback((trackId: string) => {
    setBannedTracks((prev) => (prev.includes(trackId) ? prev : [...prev, trackId]));
  }, []);

  const unbanTrack = useCallback((trackId: string) => {
    setBannedTracks((prev) => prev.filter((id) => id !== trackId));
  }, []);

  const clearAllBans = useCallback(() => {
    setBannedArtists([]);
    setBannedTracks([]);
  }, []);

  const setStrictnessMode = useCallback((mode: 'strict' | 'standard' | 'all') => {
    setStrictnessModeState(mode);
  }, []);

  // Allow user to manually paste or edit lyrics for a track
  const setCustomLyrics = useCallback((trackId: string, lyricsText: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, lyrics: lyricsText } : t))
    );
    setCurrentTrack((prev) => (prev && prev.id === trackId ? { ...prev, lyrics: lyricsText } : prev));
  }, []);

  const loadDemoData = useCallback(() => {
    clearRadio();
    setIsDemoMode(true);
    setTracks(DEMO_TRACKS);
    setPlaylists(DEMO_PLAYLISTS);
    setQueue(DEMO_TRACKS);
    setQueueIndex(0);
    setCurrentTrack(DEMO_TRACKS[0]);
    setCurrentTime(0);
    setIsPlaying(true);
    if (ytPlayerRef.current?.loadVideoById) {
      try {
        ytPlayerRef.current.loadVideoById(DEMO_TRACKS[0].id);
        ytPlayerRef.current.playVideo();
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const importTracks = useCallback((newTracks: MusicTrack[]) => {
    if (!newTracks || newTracks.length === 0) return;

    clearRadio();
    setIsDemoMode(false);
    setTracks(newTracks);
    setQueue(newTracks);
    setQueueIndex(0);
    setCurrentTrack(newTracks[0]);
    setCurrentTime(0);
    setDuration(newTracks[0]?.duration || 210);

    // Auto-create smart playlists
    const genreMap = new Map<string, string[]>();
    newTracks.forEach((t) => {
      if (t.genre) {
        const arr = genreMap.get(t.genre) || [];
        arr.push(t.id);
        genreMap.set(t.genre, arr);
      }
    });

    const smartPlaylists: Playlist[] = [
      {
        id: 'pl_fav_' + Date.now(),
        name: 'お気に入り・高リピート',
        trackIds: newTracks.filter((t) => t.isFavorite || t.playCount >= 3).map((t) => t.id),
        createdAt: new Date().toISOString().slice(0, 16),
        updatedAt: new Date().toISOString().slice(0, 16),
      },
      ...Array.from(genreMap.entries())
        .slice(0, 4)
        .map(([g, ids]) => ({
          id: `pl_${g}_${Date.now()}`,
          name: `${g} セレクション`,
          trackIds: ids.slice(0, 30),
          createdAt: new Date().toISOString().slice(0, 16),
          updatedAt: new Date().toISOString().slice(0, 16),
        })),
    ];
    setPlaylists(smartPlaylists);

    if (ytPlayerRef.current?.loadVideoById && newTracks[0]) {
      try {
        ytPlayerRef.current.loadVideoById(newTracks[0].id, 0);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const addSingleTrackByUrl = useCallback(
    (urlOrId: string, customTitle?: string, customArtist?: string): boolean => {
      const id = extractYouTubeId(urlOrId);
      if (!id) return false;

      const meta = extractSmartTrackMeta(customTitle || 'YouTube Music Track', customArtist || 'YouTube');

      const newTrack: MusicTrack = {
        id,
        title: meta.cleanTitle,
        artist: meta.cleanArtist,
        genre: meta.originalProducer ? 'ボカロ・VOCALOID' : 'J-POP',
        playCount: 1,
        duration: 240,
        lastPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
        firstPlayed: new Date().toISOString().replace('T', ' ').slice(0, 16),
        isFavorite: true,
        thumbnailUrl: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
      };

      setTracks((prev) => [newTrack, ...prev.filter((t) => t.id !== id)]);
      setQueue((prev) => [newTrack, ...prev]);
      playTrack(newTrack);
      return true;
    },
    [playTrack]
  );

  const appendTracks = useCallback(
    (newTracks: MusicTrack[]): void => {
      if (!newTracks || newTracks.length === 0) return;
      setTracks((prev) => {
        const base = isDemoMode ? [] : prev;
        const have = new Set(base.map((t) => t.id));
        const fresh = newTracks.filter((t) => !have.has(t.id));
        return fresh.length ? [...fresh, ...base] : base;
      });
      if (isDemoMode) setIsDemoMode(false);
    },
    [isDemoMode]
  );

  const clearAllData = useCallback(() => {
    clearRadio();
    wantPlayingRef.current = false;
    if (ytPlayerRef.current?.pauseVideo) {
      ytPlayerRef.current.pauseVideo();
    }
    setTracks([]);
    setPlaylists([]);
    setQueue([]);
    setCurrentTrack(null);
    setIsPlaying(false);
    audioKeepAlive.onPause({ immediate: true });
    setIsDemoMode(false);
    clearDB();
    localStorage.removeItem(STORAGE_KEY_TRACKS);
    localStorage.removeItem(STORAGE_KEY_PLAYLISTS);
    localStorage.removeItem(STORAGE_KEY_IS_DEMO);
  }, []);

  const unmuteAudio = useCallback(() => {
    try {
      if (ytPlayerRef.current?.unMute) {
        ytPlayerRef.current.unMute();
      }
      if (ytPlayerRef.current?.setVolume) {
        ytPlayerRef.current.setVolume(userVolumeRef.current);
      }
      setIsPlayerMuted(false);
    } catch (e) {}
  }, []);

  const resyncPlayer = useCallback(() => {
    if (!currentTrack) return;
    try {
      unmuteAudio();
      const pos = timeStore.get().currentTime || 0;
      if (ytPlayerRef.current?.loadVideoById) {
        loadSeqRef.current += 1;
        loadedAtRef.current = Date.now();
        adGiveUpRef.current = false;
        wantPlayingRef.current = true;
        ytPlayerRef.current.loadVideoById({ videoId: currentTrack.id, startSeconds: pos });
        ytPlayerRef.current.playVideo?.();
        startWatchdog(currentTrack.id);
      }
      setIsPlaying(true);
      setIsBuffering(false);
      audioKeepAlive.onPlay(currentTrack);
    } catch (e) {
      console.warn('resyncPlayer failed:', e);
    }
  }, [currentTrack, unmuteAudio, startWatchdog]);

  // Reset lyrics offset whenever track changes
  useEffect(() => {
    setLyricsOffset(0);
  }, [currentTrack?.id]);

  const adjustLyricsOffset = useCallback((delta: number) => {
    setLyricsOffset((prev) => Math.round((prev + delta) * 10) / 10);
  }, []);

  const resetLyricsOffset = useCallback(() => {
    setLyricsOffset(0);
  }, []);

  const setLyricsDisplayMode = useCallback((mode: LyricsDisplayMode) => {
    setLyricsDisplayModeState(mode);
    try {
      localStorage.setItem('melotrace_lyrics_mode_v1', mode);
    } catch (e) {}
  }, []);

  const setArtworkAspectRatio = useCallback((ratio: ArtworkAspectRatio) => {
    setArtworkAspectRatioState(ratio);
    try {
      localStorage.setItem('melotrace_artwork_ratio_v1', ratio);
    } catch (e) {}
  }, []);

  const createPlaylist = useCallback(
    (name: string, description?: string, color?: string, initialTrackIds: string[] = []): Playlist => {
      const newPl: Playlist = {
        id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: name.trim() || '新規プレイリスト',
        description: description?.trim(),
        color: color || '#0a84ff',
        coverTrackId: initialTrackIds[0],
        trackIds: initialTrackIds,
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
        updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      };
      setPlaylists((prev) => [newPl, ...prev]);
      return newPl;
    },
    []
  );

  const updatePlaylist = useCallback((playlistId: string, updates: Partial<Playlist>) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, ...updates, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) }
          : pl
      )
    );
  }, []);

  const deletePlaylist = useCallback((playlistId: string) => {
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          if (pl.trackIds.includes(trackId)) return pl;
          return {
            ...pl,
            trackIds: [...pl.trackIds, trackId],
            coverTrackId: pl.coverTrackId || trackId,
            updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          };
        }
        return pl;
      })
    );
  }, []);

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          const nextIds = pl.trackIds.filter((id) => id !== trackId);
          return {
            ...pl,
            trackIds: nextIds,
            coverTrackId: pl.coverTrackId === trackId ? nextIds[0] : pl.coverTrackId,
            updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          };
        }
        return pl;
      })
    );
  }, []);

  const setRecordYtHistory = useCallback((v: boolean) => {
    setRecordYtHistoryState(v);
    try {
      localStorage.setItem(YT_HISTORY_KEY, String(v));
    } catch (e) {}
  }, []);

  // ---- Cloud sync (Google Drive appDataFolder) ----
  const tokenRef = useRef<{ accessToken: string; expiresAt: number } | null>(null);
  const cloudFileIdRef = useRef<string | null>(null);
  const syncingRef = useRef(false);


  const syncSettings = useMemo(
    () => ({ strictnessMode, lyricsDisplayMode, artworkAspectRatio, retroPlayerSkin, themeId, artistFilterMode, artworkSource, favoriteArtists }),
    [strictnessMode, lyricsDisplayMode, artworkAspectRatio, retroPlayerSkin, themeId, artistFilterMode, artworkSource, favoriteArtists]
  );

  const syncSignature = useMemo(
    () => contentSignature({ tracks, bannedArtists, bannedTracks, playlists, settings: syncSettings }),
    [tracks, bannedArtists, bannedTracks, playlists, syncSettings]
  );

  // 同期処理から最新の状態を読むための参照
  const latestRef = useRef({ tracks, bannedArtists, bannedTracks, playlists, settings: syncSettings, isDemoMode, sig: syncSignature });
  latestRef.current = { tracks, bannedArtists, bannedTracks, playlists, settings: syncSettings, isDemoMode, sig: syncSignature };

  const applyState = useCallback((a: ApplyState) => {
    setTracks(a.tracks);
    if (a.leaveDemoMode) setIsDemoMode(false);
    setBannedArtists(a.bannedArtists);
    setBannedTracks(a.bannedTracks);
    setPlaylists(a.playlists);
    const st = a.settings || {};
    if (st.strictnessMode) setStrictnessModeState(st.strictnessMode);
    if (st.lyricsDisplayMode) setLyricsDisplayModeState(st.lyricsDisplayMode);
    if (st.artworkAspectRatio) setArtworkAspectRatioState(st.artworkAspectRatio);
    if (st.retroPlayerSkin) setRetroPlayerSkin(st.retroPlayerSkin);
    if (st.themeId) setThemeIdState(st.themeId);
    if (st.artistFilterMode) setArtistFilterModeState(st.artistFilterMode);
    if (st.artworkSource) setArtworkSourceState(st.artworkSource);
    if (Array.isArray(st.favoriteArtists)) setFavoriteArtists(st.favoriteArtists);
  }, []);

  const ensureToken = useCallback(async () => {
    const t = tokenRef.current;
    if (t && t.expiresAt > Date.now()) return t.accessToken;
    // 期限切れ（約1時間）: 同意済みなら更新を試みる（ブラウザによってはポップアップが開く）
    const fresh = await requestAccessToken('');
    tokenRef.current = fresh;
    return fresh.accessToken;
  }, []);

  const runSync = useCallback(
    async (mode: SyncMode = 'auto') => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setIsCloudSyncing(true);
      setCloudError(null);
      setCloudMessage(null);
      try {
        const token = await ensureToken();
        const remote = await pullFromCloud(token);
        if (remote) cloudFileIdRef.current = remote.fileId;

        const latest = latestRef.current;
        const localHash = hashString(latest.sig);
        let modifiedAt = '';
        try {
          modifiedAt = localStorage.getItem(LOCAL_MODIFIED_KEY) || '';
        } catch (e) {}

        const decision = decideSync({
          mode,
          remote: remote ? remote.payload : null,
          base: readBase(),
          localHash,
          local: {
            tracks: latest.tracks,
            bannedArtists: latest.bannedArtists,
            bannedTracks: latest.bannedTracks,
            playlists: latest.playlists,
            settings: latest.settings,
            modifiedAt,
            isDemoMode: latest.isDemoMode,
          },
          now: nowIso(),
        });

        let rev = remote ? remote.payload.updatedAt : '';
        if (decision.apply) applyState(decision.apply);
        if (decision.push) {
          cloudFileIdRef.current = await pushToCloud(token, decision.push, cloudFileIdRef.current);
          rev = decision.push.updatedAt;
        }
        if (decision.apply) {
          // 反映後の状態が描画されてから、その内容を「同期済みの基準」として記録する
          setTimeout(() => writeBase(hashString(latestRef.current.sig), rev), 1200);
        } else if (rev) {
          writeBase(localHash, rev);
        }

        setCloudMessage(decision.message);
        const done = nowLabel();
        setCurrentUser((u) => {
          if (!u) return u;
          const updated = { ...u, lastSync: done };
          try {
            localStorage.setItem('melotrace_user_account_v1', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      } catch (e: any) {
        setCloudError(e?.message || '同期に失敗しました');
      } finally {
        syncingRef.current = false;
        setIsCloudSyncing(false);
      }
    },
    [ensureToken, applyState]
  );

  const loginWithGoogle = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      setCloudError(`Googleログインはまだ設定されていません（${GOOGLE_CLIENT_ID_ENV_NAME} が未設定です）`);
      return;
    }
    setIsCloudSyncing(true);
    setCloudError(null);
    try {
      const tok = await requestAccessToken('select_account');
      tokenRef.current = tok;
      const prof = await fetchProfile(tok.accessToken);
      const user: UserAccount = {
        uid: prof.sub,
        email: prof.email,
        displayName: prof.name || prof.email,
        photoURL: prof.picture,
      };
      setCurrentUser(user);
      localStorage.setItem('melotrace_user_account_v1', JSON.stringify(user));
    } catch (e: any) {
      setCloudError(e?.message || 'ログインに失敗しました');
      setIsCloudSyncing(false);
      return;
    }
    setIsCloudSyncing(false);
    await runSync('auto');
  }, [runSync]);

  const logout = useCallback(() => {
    if (tokenRef.current) revokeToken(tokenRef.current.accessToken);
    tokenRef.current = null;
    cloudFileIdRef.current = null;
    setCurrentUser(null);
    setCloudError(null);
    setCloudMessage(null);
    localStorage.removeItem('melotrace_user_account_v1');
    localStorage.removeItem(SYNC_BASE_KEY);
  }, []);

  const syncWithCloud = useCallback(async () => {
    if (!currentUser) return;
    await runSync('auto');
  }, [currentUser, runSync]);

  const forceCloudSync = useCallback(
    async (mode: 'push' | 'pull') => {
      if (!currentUser) return;
      await runSync(mode);
    },
    [currentUser, runSync]
  );

  // 同期対象が「前回同期した内容」から変わったら、変更時刻を記録し、ログイン中なら自動で同期する
  useEffect(() => {
    if (!isHydratedRef.current) return;
    const base = readBase();
    if (!base || base.hash === hashString(syncSignature)) return;
    try {
      localStorage.setItem(LOCAL_MODIFIED_KEY, nowIso());
    } catch (e) {}
    if (!currentUser) return;
    const timer = setTimeout(() => {
      const b = readBase();
      if (!b || b.hash === hashString(latestRef.current.sig)) return;
      if (!tokenRef.current || tokenRef.current.expiresAt <= Date.now()) return;
      runSync('auto');
    }, 4000);
    return () => clearTimeout(timer);
  }, [syncSignature, currentUser, runSync]);

  // Register iOS Lock Screen and MediaSession action listeners
  useEffect(() => {
    audioKeepAlive.setupMediaSessionHandlers({
      onPlay: () => resumePlayback(),
      onPause: () => pausePlayback(),
      onNext: () => nextTrack(),
      onPrev: () => prevTrack(),
      onSeek: (sec) => seekTo(sec),
    });
  }, [resumePlayback, pausePlayback, nextTrack, prevTrack, seekTo]);

  // Global Keyboard Shortcuts (Space: Play/Pause, Meta/Ctrl+Arrows: Skip, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || (activeEl as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        nextTrack();
      } else if (e.code === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        prevTrack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, nextTrack, prevTrack]);

  return (
    <PlayerContext.Provider
      value={{
        tracks,
        activeTracks,
        musicTracks,
        bgmTracks,
        playlists,
        currentTrack,
        isPlaying,
        playbackRate,
        queue,
        queueIndex,
        repeatMode,
        isShuffle,
        sleepTimerMinutes,
        isNowPlayingOpen,
        ytPlayerReady,
        nowPlayingTab,
        isDemoMode,
        isLoadingLyrics,
        isBuffering,
        isAdPlaying,
        bannedArtists,
        bannedTracks,
        strictnessMode,
        selectedArtistForDetail,
        setSelectedArtistForDetail,
        setStrictnessMode,
        banArtist,
        unbanArtist,
        favoriteArtists,
        toggleFavoriteArtist,
        addFavoriteArtists,
        banTrack,
        unbanTrack,
        clearAllBans,
        setCustomLyrics,
        setNowPlayingTab,
        playTrack,
        playBgmStation,
        togglePlay,
        nextTrack,
        prevTrack,
        seekTo,
        setPlaybackRate,
        setRepeatMode,
        setIsShuffle,
        setSleepTimer,
        toggleFavorite,
        setIsNowPlayingOpen,
        loadDemoData,
        importTracks,
        addSingleTrackByUrl,
        appendTracks,
        appendToQueue,
        radioSeed,
        startRadio,
        stopRadio: clearRadio,
        clearAllData,
        createPlaylist,
        updatePlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        resyncPlayer,
        unmuteAudio,
        volume,
        setVolume,
        isPlayerMuted,
        lyricsOffset,
        adjustLyricsOffset,
        resetLyricsOffset,
        lyricsDisplayMode,
        setLyricsDisplayMode,
        artworkAspectRatio,
        setArtworkAspectRatio,
        isRetroPlayerOpen,
        setIsRetroPlayerOpen,
        retroPlayerSkin,
        setRetroPlayerSkin,
        isBgGuideOpen,
        setIsBgGuideOpen,
        currentUser,
        loginWithGoogle,
        logout,
        isCloudSyncing,
        syncWithCloud,
        cloudConfigured: Boolean(GOOGLE_CLIENT_ID),
        cloudError,
        recordYtHistory,
        setRecordYtHistory,
        cloudMessage,
        forceCloudSync,
        playbackHint,
        dismissPlaybackHint,
        keepAliveEnabled,
        setKeepAliveEnabled,
        themeId,
        setThemeId,
        artistFilterMode,
        setArtistFilterMode,
        artistStatus,
        setArtistOverride,
        verifyProgress,
        artworkSource,
        setArtworkSource,
        albumArtFor,
        albumArtState,
        retryAlbumArt,
        playMetrics,
        playWait,
        retryPlayback: resumePlayback,
        getPlaybackLog,
        clearPlaybackLog,
        restartPlayer,
        isUnplayable,
        playbackHintLink,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = (): PlayerContextType => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
