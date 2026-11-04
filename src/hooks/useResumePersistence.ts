import { useEffect, useRef, type MutableRefObject } from 'react';
import type { MusicTrack } from '../types/music';
import { saveResume } from '../utils/resumeState';
import { timeStore } from '../utils/timeStore';

const SAVE_INTERVAL_MS = 10_000;

/**
 * 再生位置などの保存（resumeState）をプレーヤーにつなぐ薄いフック。API消費: 0ユニット。
 * 保存のタイミング: 再生中は10秒ごと／一時停止／画面が隠れる・pagehide／曲やキューが変わるとき。
 * 起動直後（復元しただけ）は保存しない（前回のデータを上書きしないため）。
 */
export function useResumePersistence(args: {
  track: MusicTrack | null;
  queue: MusicTrack[];
  isPlaying: boolean;
  libraryTracks: MusicTrack[];
  playerRef: MutableRefObject<any>;
  /** 復元した位置。ミニプレーヤーの位置表示（timeStore）に反映する */
  initial: { seconds: number; duration?: number | null } | null;
}): void {
  const { track, queue, isPlaying, libraryTracks, playerRef, initial } = args;
  const latest = useRef({ track, queue, libraryTracks });
  latest.current = { track, queue, libraryTracks };

  const getPos = (): number => {
    try {
      const p = playerRef.current;
      const st = p?.getPlayerState?.();
      // 再生中・一時停止・読み込み中のときだけプレーヤーの値を使う（未再生のときは0が返るため）
      if (st === 1 || st === 2 || st === 3) {
        const c = p.getCurrentTime?.();
        if (typeof c === 'number' && Number.isFinite(c)) return c;
      }
    } catch (e) {}
    return timeStore.get().currentTime || 0;
  };

  const saveNow = (seconds?: number) => {
    const { track: t, queue: q, libraryTracks: lib } = latest.current;
    saveResume({ track: t, seconds: seconds ?? getPos(), queue: q, libraryIds: new Set(lib.map((x) => x.id)) });
  };

  // 起動時: 復元した秒をミニプレーヤーの位置表示に反映（再生はしない）
  useEffect(() => {
    if (initial && initial.seconds > 0) {
      timeStore.setCurrentTime(initial.seconds);
      if (initial.duration && initial.duration > 0) timeStore.setDuration(initial.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 曲・キューが変わったとき（曲が変わったら0秒から）
  const prevIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = track?.id ?? null;
    const first = prevIdRef.current === undefined;
    const changed = !first && prevIdRef.current !== id;
    prevIdRef.current = id;
    if (first) return;
    saveNow(changed ? 0 : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, queue]);

  // 一時停止したとき
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!isPlaying) saveNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // 再生中は10秒ごと
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => saveNow(), SAVE_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // 背面に回る・閉じる
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    const onPageHide = () => saveNow();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
