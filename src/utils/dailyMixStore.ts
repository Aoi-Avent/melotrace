/**
 * 日替わりミックスの保存（日付と曲IDだけ）。同じ日に中身が変わらないようにするため。
 * 端末内の localStorage のみ。クラウド同期には載せない。API 消費なし。
 */
export const DAILY_MIX_STORAGE_KEY = 'melotrace_daily_mix_v1';

export interface StoredDailyMixes {
  date: string; // 'YYYY-MM-DD'（ローカル）
  mixes: Record<string, string[]>; // ミックスID（'daily:recent'、将来 'time:朝' など）→ 曲ID
}

/** 保存分を読む。日付が today と違う・壊れている場合は空を返す（= 作り直し） */
export function loadDailyMixes(today: string): StoredDailyMixes {
  try {
    const raw = localStorage.getItem(DAILY_MIX_STORAGE_KEY);
    if (!raw) return { date: today, mixes: {} };
    const p = JSON.parse(raw) as Partial<StoredDailyMixes>;
    if (p.date !== today || !p.mixes || typeof p.mixes !== 'object') return { date: today, mixes: {} };
    const mixes: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(p.mixes)) {
      if (Array.isArray(v)) mixes[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return { date: today, mixes };
  } catch {
    return { date: today, mixes: {} };
  }
}

export function saveDailyMixes(data: StoredDailyMixes): void {
  try {
    localStorage.setItem(DAILY_MIX_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 容量超過などは無視（次回作り直すだけ） */
  }
}
