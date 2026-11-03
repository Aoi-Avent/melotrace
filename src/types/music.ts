export interface MusicTrack {
  id: string; // YouTube Video ID (11 chars)
  title: string;
  artist: string;
  channelId?: string;
  genre: string;
  playCount: number;
  duration?: number | null; // in seconds
  lastPlayed: string; // YYYY-MM-DD HH:mm
  firstPlayed?: string;
  isFavorite: boolean;
  thumbnailUrl: string;
  lyrics?: string; // LRC formatted or plain text
  notes?: string;
  isDemo?: boolean;
  /** ラジオがキューに足した曲。ライブラリには入れず、再生しても回数・最終再生を変えない */
  isRadio?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  color?: string;
  coverTrackId?: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type PlayMode = 'stream' | 'youtube';
export type RepeatMode = 'off' | 'all' | 'one';
export type ActiveTab = 'home' | 'radio' | 'library' | 'search' | 'analytics' | 'import' | 'artists';

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export type ArtworkAspectRatio = 'auto' | '1:1' | '16:9';
export type LyricsDisplayMode = 'dynamic' | 'static';

export type PrimarySortKey = 'artist' | 'playCount' | 'lastPlayed' | 'title' | 'firstPlayed' | 'isFavorite';
export type SecondarySortKey = 'none' | 'artist' | 'playCount' | 'lastPlayed' | 'title' | 'firstPlayed';
export type SortOrder = 'asc' | 'desc';

export interface ArtistSummary {
  name: string;
  trackCount: number;
  totalPlayCount: number;
  favoriteCount: number;
  firstPlayed?: string;
  lastPlayed?: string;
  tracks: MusicTrack[];
  thumbnailUrl?: string;
  originalProducer?: string;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  lastSync?: string;
}

export interface QuickMixItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'mood' | 'genre' | 'history' | 'activity';
  color: string;
  filterFn: (tracks: MusicTrack[]) => MusicTrack[];
}
