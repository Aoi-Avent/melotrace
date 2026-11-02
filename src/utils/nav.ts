/**
 * 画面の移動（下のタブ・ライブラリの階層・設定ページ）と、下のバーの「たたみ」状態を持つ小さなストア。
 * どの画面からでも navSetTab('import') のように呼べる。
 */
import { useSyncExternalStore } from 'react';
import type { ActiveTab } from '../types/music';

export type LibRoute = 'root' | 'all' | 'vocaloid' | 'bgm' | 'favorites' | 'playlists' | 'artists' | 'favArtists';

interface NavState {
  tab: ActiveTab;
  prevTab: ActiveTab;
  lib: LibRoute;
}

const TAB_KEY = 'melotrace_active_tab_v5';
const VALID: ActiveTab[] = ['home', 'radio', 'library', 'artists', 'search', 'analytics', 'import'];

function loadInitial(): NavState {
  let tab: ActiveTab = 'home';
  try {
    const saved = localStorage.getItem(TAB_KEY) as ActiveTab | null;
    if (saved && VALID.includes(saved)) tab = saved;
  } catch (e) {}
  // 設定・分析・アーティストは、ほかの画面の中の階層として扱う（起動時はホーム/ライブラリに戻す）
  let lib: LibRoute = 'root';
  if (tab === 'artists') {
    tab = 'library';
    lib = 'artists';
  }
  if (tab === 'import' || tab === 'analytics') tab = 'home';
  return { tab, prevTab: 'home', lib };
}

let state: NavState = loadInitial();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

function persist() {
  try {
    if (state.tab !== 'import' && state.tab !== 'analytics') localStorage.setItem(TAB_KEY, state.tab);
  } catch (e) {}
}

export function useNav(): NavState {
  return useSyncExternalStore(subscribe, () => state);
}

/** 下のタブでの「親」のタブ（設定・分析などは、開いた元の画面として扱う） */
export function parentTab(s: NavState): ActiveTab {
  if (s.tab === 'import' || s.tab === 'analytics') return s.prevTab;
  if (s.tab === 'artists') return 'library';
  return s.tab;
}

export function navSetTab(tab: ActiveTab) {
  if (tab === 'artists') {
    navLib('artists');
    return;
  }
  if (tab === state.tab) {
    // 開いているタブをもう一度押すと、そのタブの一番上の階層に戻る
    if (tab === 'library' && state.lib !== 'root') {
      state = { ...state, lib: 'root' };
      emit();
    }
    return;
  }
  const isSub = tab === 'import' || tab === 'analytics';
  state = { ...state, prevTab: isSub ? state.tab : state.prevTab, tab, lib: tab === 'library' ? state.lib : state.lib };
  setCompactChrome(false);
  persist();
  emit();
}

export function navLib(route: LibRoute) {
  state = { ...state, tab: 'library', lib: route, prevTab: state.tab === 'import' || state.tab === 'analytics' ? state.prevTab : state.tab };
  setCompactChrome(false);
  persist();
  emit();
}

/** 「戻る」ボタン */
export function navBack() {
  if (state.tab === 'import' || state.tab === 'analytics') {
    state = { ...state, tab: state.prevTab };
  } else if (state.tab === 'library' && state.lib !== 'root') {
    state = { ...state, lib: 'root' };
  } else {
    return;
  }
  setCompactChrome(false);
  persist();
  emit();
}

/* ===== 下のバーの「たたみ」状態（スクロールで小さくなる） ===== */
let compact = false;
const cListeners = new Set<() => void>();
export function setCompactChrome(v: boolean) {
  if (compact === v) return;
  compact = v;
  cListeners.forEach((l) => l());
}
export function useCompactChrome(): boolean {
  return useSyncExternalStore(
    (cb) => {
      cListeners.add(cb);
      return () => {
        cListeners.delete(cb);
      };
    },
    () => compact
  );
}

let installed = false;
/** 画面を下へスクロールすると下のバーをたたみ、上へ戻すと広げる */
export function installChromeScroll() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const last = new WeakMap<Element, number>();
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target;
      if (!(el instanceof Element) || !el.classList.contains('ios-scroll-container')) return;
      const top = el.scrollTop;
      const prev = last.get(el) ?? top;
      last.set(el, top);
      const d = top - prev;
      if (top < 12) setCompactChrome(false);
      else if (d > 6) setCompactChrome(true);
      else if (d < -6) setCompactChrome(false);
    },
    { capture: true, passive: true }
  );
}
