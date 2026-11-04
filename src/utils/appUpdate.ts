/**
 * 最新のデプロイを確認して、すぐ読み込み直すための小さなストア（web版・iosアプリ版 共通）。
 * 背景: GitHub Pages は index.html を約10分キャッシュさせるため、デプロイ直後でも古い画面が残ることがある。
 *       version.json は毎回「キャッシュなし + 時刻つきURL」で取るので、その待ち時間に左右されない。
 * API消費: YouTube Data API は 0ユニット（自サイトの静的ファイル version.json を取得するだけ）。
 */
import { useSyncExternalStore } from 'react';

declare const __APP_BUILD_ID__: string | undefined;

export const CURRENT_BUILD_ID: string = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'error';
interface UpdateState {
  status: UpdateStatus;
  latestId: string | null;
}

let state: UpdateState = { status: 'idle', latestId: null };
const listeners = new Set<() => void>();
const set = (next: UpdateState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

/** 最新のデプロイを確認する。新しければ status が 'available' になる。 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (state.status === 'checking') return state.status;
  const prev = state;
  set({ ...prev, status: 'checking' });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const data = (await res.json()) as { id?: unknown };
    if (typeof data.id !== 'string' || !data.id) throw new Error('bad version.json');
    const isNew = data.id !== CURRENT_BUILD_ID && CURRENT_BUILD_ID !== 'dev';
    set({ status: isNew ? 'available' : 'latest', latestId: data.id });
  } catch {
    // 通信できない・開発中(version.json なし)は静かに戻す（すでに新版が見つかっている場合はそのまま残す）
    set(prev.status === 'available' ? prev : { ...prev, status: 'error' });
  }
  return state.status;
}

/** 時刻つきURLで開き直す＝キャッシュ済みの古い index.html を使わず、最新の画面を読み込む。 */
export function applyUpdate() {
  const u = new URL(window.location.href);
  u.searchParams.set('v', state.latestId || String(Date.now()));
  window.location.replace(u.toString());
}

let started = false;
/** 起動時・アプリに戻った時・10分ごと（画面表示中のみ）に確認する。何度呼んでも1回だけ動く。 */
export function startUpdateWatcher() {
  if (started) return;
  started = true;
  // applyUpdate() で付けた ?v= は、読み込み後に消す（見た目のURLを元に戻す）
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has('v')) {
      u.searchParams.delete('v');
      window.history.replaceState(null, '', u.toString());
    }
  } catch {
    // 何もしない
  }
  let last = 0;
  const run = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - last < 30_000) return;
    last = Date.now();
    void checkForUpdate();
  };
  window.setTimeout(run, 3000);
  document.addEventListener('visibilitychange', run);
  window.addEventListener('pageshow', run);
  window.setInterval(run, 10 * 60_000);
}
