/**
 * Lightweight native IndexedDB storage for large music libraries
 * Prevents localStorage 5MB quota errors and keeps the main UI thread silky smooth.
 */
import { MusicTrack, Playlist } from '../types/music';

const DB_NAME = 'melotrace_db';
// v3: 再生ログ用の新ストア play_log を追加するため（既存4ストアは contains 確認で作成済みのまま残る）
const DB_VERSION = 3;
const STORE_TRACKS = 'tracks';
const STORE_PLAYLISTS = 'playlists';
/** YouTube Data API のキャッシュと日次使用量（youtubeApi.ts 用。clearDB では消さない） */
export const STORE_YT_CACHE = 'yt_cache';
export const STORE_YT_USAGE = 'yt_usage';
/** 再生ログ（playLog.ts 用。端末内のみ。全消去では消す） */
export const STORE_PLAY_LOG = 'play_log';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_YT_CACHE)) {
        db.createObjectStore(STORE_YT_CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_YT_USAGE)) {
        db.createObjectStore(STORE_YT_USAGE, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORE_PLAY_LOG)) {
        const log = db.createObjectStore(STORE_PLAY_LOG, { keyPath: 'id', autoIncrement: true });
        log.createIndex('ts', 'ts', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTracksToDB(tracks: MusicTrack[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    store.clear();
    for (const track of tracks) {
      store.put(track);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('saveTracksToDB failed:', err);
  }
}

/** 変更された曲だけを書き込む（全件の書き直しより、処理も電池もずっと軽い） */
export async function putTracksToDB(tracks: MusicTrack[]): Promise<void> {
  if (tracks.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    for (const t of tracks) store.put(t);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('putTracksToDB failed:', err);
  }
}

export async function deleteTracksFromDB(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    for (const id of ids) store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('deleteTracksFromDB failed:', err);
  }
}

export async function loadTracksFromDB(): Promise<MusicTrack[] | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, 'readonly');
    const store = tx.objectStore(STORE_TRACKS);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (Array.isArray(result) && result.length > 0) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('loadTracksFromDB failed:', err);
    return null;
  }
}

export async function savePlaylistsToDB(playlists: Playlist[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PLAYLISTS, 'readwrite');
    const store = tx.objectStore(STORE_PLAYLISTS);
    store.clear();
    for (const pl of playlists) {
      store.put(pl);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('savePlaylistsToDB failed:', err);
  }
}

export async function loadPlaylistsFromDB(): Promise<Playlist[] | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PLAYLISTS, 'readonly');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (Array.isArray(result) && result.length > 0) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('loadPlaylistsFromDB failed:', err);
    return null;
  }
}

export async function clearDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_TRACKS, STORE_PLAYLISTS, STORE_PLAY_LOG], 'readwrite');
    tx.objectStore(STORE_TRACKS).clear();
    tx.objectStore(STORE_PLAYLISTS).clear();
    tx.objectStore(STORE_PLAY_LOG).clear();
  } catch (err) {
    console.warn('clearDB failed:', err);
  }
}
