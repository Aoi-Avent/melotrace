/**
 * 再生ログ（端末内のみ）。「いつ・何を・どこから聴いたか」を1回ずつ IndexedDB に残す。
 * 後続の視聴履歴・時間帯ミックス・年間まとめの土台。クラウド同期（syncMerge.ts）には載せない。
 * 時刻はすべて端末のローカル時刻（既存 lastPlayed の UTC 表記とは別物）。
 */
import { openDB, STORE_PLAY_LOG } from './db';
import { timeStore } from './timeStore';

export type PlayRoute = 'library' | 'radio' | 'search' | 'other';

export interface PlayLogRow {
  id?: number; // 自動採番
  ts: number; // エポックms
  date: string; // 'YYYY-MM-DD'（ローカル日付）
  hour: number; // 0〜23（ローカル時刻）
  trackId: string;
  route: PlayRoute;
  sec?: number; // 聴いた秒数（曲が切り替わるときに書き足す）
}

export const PLAY_LOG_MAX_ROWS = 50000;
export const PLAY_LOG_MAX_YEARS = 3;

const pad = (n: number) => String(n).padStart(2, '0');

/** ローカル日付 'YYYY-MM-DD'（toISOString は UTC なので使わない） */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 直前に書いた行（sec の書き足し用）。メモリ上のみ。
let lastRowPending: Promise<number | null> | null = null;

/** 直前の行に秒数を書き足す。IndexedDB の API 消費はなし（YouTube API は使わない）。 */
export async function finishPlayLog(sec: number): Promise<void> {
  const pending = lastRowPending;
  lastRowPending = null;
  if (!pending) return;
  try {
    const id = await pending;
    if (id == null) return;
    const s = Math.max(0, Math.round(sec));
    const db = await openDB();
    const tx = db.transaction(STORE_PLAY_LOG, 'readwrite');
    const store = tx.objectStore(STORE_PLAY_LOG);
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as PlayLogRow | undefined;
      if (row) store.put({ ...row, sec: s });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('finishPlayLog failed:', err);
  }
}

/** 1回の再生を追記する。失敗しても再生は止めない（console.warn のみ）。 */
export function appendPlayLog(trackId: string, route: PlayRoute): void {
  // 先に直前の曲の秒数を確定する（切り替え前の再生位置を timeStore から読む）
  void finishPlayLog(timeStore.get().currentTime || 0);
  const now = new Date();
  const row: PlayLogRow = {
    ts: now.getTime(),
    date: localDateString(now),
    hour: now.getHours(),
    trackId,
    route,
  };
  lastRowPending = (async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_PLAY_LOG, 'readwrite');
      const req = tx.objectStore(STORE_PLAY_LOG).add(row);
      return await new Promise<number | null>((resolve, reject) => {
        tx.oncomplete = () => resolve(typeof req.result === 'number' ? req.result : null);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('appendPlayLog failed:', err);
      return null;
    }
  })();
}

/** 全行を新しい順に読む（limit 指定可）。 */
export async function readPlayLog(limit?: number): Promise<PlayLogRow[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PLAY_LOG, 'readonly');
    const index = tx.objectStore(STORE_PLAY_LOG).index('ts');
    const out: PlayLogRow[] = [];
    return await new Promise<PlayLogRow[]>((resolve, reject) => {
      const req = index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || (limit != null && out.length >= limit)) return resolve(out);
        out.push(cur.value as PlayLogRow);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('readPlayLog failed:', err);
    return [];
  }
}

/** 1本のトランザクションで、条件に合う行を古い順に最大 max 件消す（max 省略で全部） */
async function deleteOldest(range: IDBKeyRange | null, max?: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PLAY_LOG, 'readwrite');
  const req = tx.objectStore(STORE_PLAY_LOG).index('ts').openCursor(range);
  let removed = 0;
  req.onsuccess = () => {
    const cur = req.result;
    if (cur && (max == null || removed < max)) {
      cur.delete();
      removed++;
      cur.continue();
    }
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 3年超・5万件超の古い行を削除する（先に3年超、その後に件数超過分）。 */
export async function prunePlayLog(): Promise<void> {
  try {
    const limitDate = new Date();
    limitDate.setFullYear(limitDate.getFullYear() - PLAY_LOG_MAX_YEARS);
    await deleteOldest(IDBKeyRange.upperBound(limitDate.getTime(), true));

    const db = await openDB();
    const count = await new Promise<number>((resolve, reject) => {
      const r = db.transaction(STORE_PLAY_LOG, 'readonly').objectStore(STORE_PLAY_LOG).count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (count > PLAY_LOG_MAX_ROWS) await deleteOldest(null, count - PLAY_LOG_MAX_ROWS);
  } catch (err) {
    console.warn('prunePlayLog failed:', err);
  }
}

let pruneScheduled = false;
/** アプリ起動後のアイドル時に1回だけ削除を走らせる。 */
export function schedulePlayLogPrune(): void {
  if (pruneScheduled || typeof window === 'undefined') return;
  pruneScheduled = true;
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
  const run = () => void prunePlayLog();
  if (ric) ric(run, { timeout: 10000 });
  else setTimeout(run, 5000);
}
