import {
  MusicTrack,
  Playlist,
  RepeatMode,
  ArtworkAspectRatio,
  LyricsDisplayMode,
  UserAccount,
} from '../types/music';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface PlayerContextType {
  tracks: MusicTrack[];
  activeTracks: MusicTrack[];
  /** 短い曲の除外を適用しない一覧（分析・再生履歴・年間まとめ用） */
  historyTracks: MusicTrack[];
  historyMusicTracks: MusicTrack[];
  musicTracks: MusicTrack[];
  bgmTracks: MusicTrack[];
  playlists: Playlist[];
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  playbackRate: number;
  queue: MusicTrack[];
  queueIndex: number;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  sleepTimerMinutes: number | null;
  isNowPlayingOpen: boolean;
  ytPlayerReady: boolean;
  nowPlayingTab: 'video' | 'lyrics' | 'art' | 'queue';
  isDemoMode: boolean;
  isLoadingLyrics: boolean;
  bannedArtists: string[];
  bannedTracks: string[];
  strictnessMode: 'strict' | 'standard' | 'all';
  selectedArtistForDetail: string | null;
  setSelectedArtistForDetail: (artist: string | null) => void;
  setStrictnessMode: (mode: 'strict' | 'standard' | 'all') => void;
  banArtist: (artist: string) => void;
  unbanArtist: (artist: string) => void;
  favoriteArtists: string[];
  toggleFavoriteArtist: (artist: string) => void;
  addFavoriteArtists: (names: string[]) => void;
  banTrack: (trackId: string) => void;
  unbanTrack: (trackId: string) => void;
  clearAllBans: () => void;
  setCustomLyrics: (trackId: string, lyrics: string) => void;
  setNowPlayingTab: (tab: 'video' | 'lyrics' | 'art' | 'queue') => void;
  isBuffering: boolean;
  isAdPlaying: boolean;
  playTrack: (track: MusicTrack, newQueue?: MusicTrack[], shouldOpenModal?: boolean) => void;
  playBgmStation: () => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (sec: number) => void;
  setPlaybackRate: (rate: number) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setIsShuffle: (shuffle: boolean) => void;
  setSleepTimer: (minutes: number | null) => void;
  toggleFavorite: (trackId: string) => void;
  setIsNowPlayingOpen: (open: boolean) => void;
  loadDemoData: () => void;
  importTracks: (newTracks: MusicTrack[]) => void;
  addSingleTrackByUrl: (urlOrId: string, customTitle?: string, customArtist?: string) => boolean;
  /** 再生を始めずにライブラリへ追加する（既存の曲は上書きせず、新しい曲だけ先頭に足す） */
  appendTracks: (newTracks: MusicTrack[]) => void;
  /** キューにだけ曲を足す（ライブラリには入れない）。afterCurrent=true なら現在の曲の直後に差し込む */
  appendToQueue: (tracks: MusicTrack[], afterCurrent?: boolean) => void;
  /** ラジオの元になった曲。ラジオ停止中は null */
  radioSeed: MusicTrack | null;
  startRadio: (seed: MusicTrack) => void;
  stopRadio: () => void;
  clearAllData: () => void;
  createPlaylist: (name: string, description?: string, color?: string, initialTrackIds?: string[]) => Playlist;
  updatePlaylist: (playlistId: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (playlistId: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  resyncPlayer: () => void;
  unmuteAudio: () => void;
  volume: number;
  setVolume: (v: number) => void;
  isPlayerMuted: boolean;
  // Lyrics offset & display mode
  lyricsOffset: number;
  adjustLyricsOffset: (delta: number) => void;
  resetLyricsOffset: () => void;
  lyricsDisplayMode: LyricsDisplayMode;
  setLyricsDisplayMode: (mode: LyricsDisplayMode) => void;
  // Artwork aspect ratio
  artworkAspectRatio: ArtworkAspectRatio;
  setArtworkAspectRatio: (ratio: ArtworkAspectRatio) => void;
  // Retro Player (iPod / Walkman)
  isRetroPlayerOpen: boolean;
  setIsRetroPlayerOpen: (open: boolean) => void;
  retroPlayerSkin: 'ipod' | 'walkman';
  setRetroPlayerSkin: (skin: 'ipod' | 'walkman') => void;
  // Background Guide
  isBgGuideOpen: boolean;
  setIsBgGuideOpen: (open: boolean) => void;
  // Cloud & Account
  currentUser: UserAccount | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  isCloudSyncing: boolean;
  syncWithCloud: () => Promise<void>;
  cloudConfigured: boolean;
  cloudError: string | null;
  // YouTube側の視聴履歴にも記録させる（埋め込みをyoutube.com経由にする。反映には再読み込みが必要）
  recordYtHistory: boolean;
  setRecordYtHistory: (v: boolean) => void;
  cloudMessage: string | null;
  forceCloudSync: (mode: 'push' | 'pull') => Promise<void>;
  // Playback robustness
  playbackHint: string | null;
  dismissPlaybackHint: () => void;
  keepAliveEnabled: boolean;
  setKeepAliveEnabled: (v: boolean) => void;
  // Theme
  themeId: string;
  setThemeId: (id: string) => void;
  // Artist verification / filter
  artistFilterMode: 'all' | 'official';
  setArtistFilterMode: (m: 'all' | 'official') => void;
  artistStatus: (artist: string) => 'verified' | 'unverified' | 'unknown';
  setArtistOverride: (artist: string, v: 'official' | 'exclude' | null) => void;
  verifyProgress: { done: number; total: number };
  // Album art
  artworkSource: 'album' | 'youtube';
  setArtworkSource: (s: 'album' | 'youtube') => void;
  albumArtFor: (trackId: string) => { url: string; album: string } | null;
  albumArtState: (trackId: string) => 'found' | 'none' | 'unknown';
  retryAlbumArt: (track: MusicTrack) => void;
  // Diagnostics
  playMetrics: PlayMetric[];
  playWait: { phase: 'idle' | 'loading' | 'slow' | 'ad' | 'retry'; ms: number };
  retryPlayback: () => void;
  getPlaybackLog: () => string[];
  clearPlaybackLog: () => void;
  restartPlayer: () => void;
  isUnplayable: (id: string) => boolean;
  playbackHintLink: string | null;
}

export interface PlayMetric {
  id: string;
  title: string;
  ms: number; // タップから曲が鳴り始めるまで
  adMs: number; // そのうち広告にかかった時間
  at: string;
  auto?: boolean; // 前の曲が終わって自動で次へ進んだか（false = 手動でタップ）
  hidden?: boolean; // 要求した時点で画面が非表示（ロック中・ホーム画面）だったか
  mode?: string; // 映像モード（normal / quiet）
}
