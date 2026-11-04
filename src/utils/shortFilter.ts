import { useMemo, useSyncExternalStore } from 'react';

/** 「短い曲を除外」。端末内のみ（localStorage）。クラウド同期には載せない。曲のデータは消さず、表示・再生候補の段階で外す。 */
export const SHORT_FILTER_KEY = 'melotrace_short_filter_v1';
export const SHORT_FILTER_OPTIONS = [0, 20, 30, 60, 90] as const; // 0 = オフ

/** duration が null・undefined・0以下（長さ不明）は false（除外しない）。minSec<=0 はオフ。 */
export function isShortTrack(duration: number | null | undefined, minSec: number): boolean {
  if (!minSec || minSec <= 0) return false;
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return false;
  return duration <= minSec;
}

const listeners = new Set<() => void>();

export function getShortFilterSec(): number {
  try {
    const n = Number(localStorage.getItem(SHORT_FILTER_KEY));
    return (SHORT_FILTER_OPTIONS as readonly number[]).includes(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setShortFilterSec(sec: number) {
  try {
    localStorage.setItem(SHORT_FILTER_KEY, String(sec));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useShortFilterSec(): number {
  return useSyncExternalStore(subscribe, getShortFilterSec, () => 0);
}

/** 設定に従って短い曲を外した配列を返す（オフのときは元の配列をそのまま返す） */
export function filterShort<T extends { duration?: number | null }>(list: T[], minSec: number): T[] {
  return minSec > 0 ? list.filter((t) => !isShortTrack(t.duration, minSec)) : list;
}

export function useShortFiltered<T extends { duration?: number | null }>(list: T[]): T[] {
  const sec = useShortFilterSec();
  return useMemo(() => filterShort(list, sec), [list, sec]);
}
