/**
 * 「ログ開始前」の再生記録の退避。
 * lastPlayed は再生のたびに上書きされるため、ログ開始前に聴いた曲を再生し直すと
 * 古い日付が失われ、履歴から消えてしまう。上書きされる前に、曲ごとの日付をここに控える。
 * 端末内（localStorage）のみ。YouTube API 消費 0。
 */
import { useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { readOldestPlayTs } from './playLog';

const KEY = 'melotrace_prelog_snapshot_v1';

/** 'YYYY-MM-DD HH:mm'（UTC）→ エポックms。壊れた値は null */
export function parseLastPlayedUtc(s: string | undefined): number | null {
  if (!s) return null;
  const v = s.trim();
  const t = Date.parse(v.replace(' ', 'T') + (v.length <= 10 ? 'T00:00:00Z' : ':00Z'));
  return Number.isNaN(t) ? null : t;
}

/** trackId → ログ開始前に最後に聴いた時刻（エポックms） */
export function loadPreLogSnapshot(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

/** App で1回呼ぶ。曲の一覧が変わるたびに、まだ控えていない「ログ開始前」の曲を足す（既存は上書きしない）。 */
export function usePreLogSnapshot(): void {
  const { activeTracks } = usePlayer();
  useEffect(() => {
    if (activeTracks.length === 0) return;
    let alive = true;
    (async () => {
      const oldest = await readOldestPlayTs();
      if (!alive) return;
      const snap = loadPreLogSnapshot();
      let changed = false;
      for (const t of activeTracks) {
        if (snap[t.id] != null) continue;
        const ts = parseLastPlayedUtc(t.lastPlayed);
        if (ts == null || (oldest != null && ts >= oldest)) continue;
        snap[t.id] = ts;
        changed = true;
      }
      if (changed) {
        try {
          localStorage.setItem(KEY, JSON.stringify(snap));
        } catch (e) {}
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeTracks]);
}
