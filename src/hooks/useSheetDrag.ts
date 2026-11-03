import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';

// 全画面シートの「開く／閉じる／元に戻る」を1つの仕組みで扱う。
// ドラッグ中は state を使わず、DOM の transform / opacity を rAF でまとめて直接更新する（再レンダリングなし）。
// 動かすのは transform と opacity だけ。API 呼び出しは無い（YouTube API ユニット消費 0）。

const CLOSE_DIST = 120; // これ以上下げて離すと閉じる
const FLICK_DIST = 40; // これ以上かつ、速度が FLICK_VEL を超えても閉じる
const FLICK_VEL = 0.5; // px/ms
const SLOP = 8; // 向きを決めるまでの遊び
const OPEN_MS = 420;
const CLOSE_MS = 260;
const SNAP_MS = 260;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** アプリ内のアニメーションOFF・省電力・OSの「視差効果を減らす」のいずれかなら true */
function motionDisabled(): boolean {
  if (typeof document === 'undefined') return true;
  const ds = document.documentElement.dataset;
  if (ds.anim === 'off' || ds.power === 'on') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** タッチ開始位置から currentTarget までに、最上部でないスクロール領域があるか */
function insideScrolledArea(target: EventTarget | null, stop: Element): boolean {
  let n = target instanceof Element ? target : null;
  while (n && n !== stop) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
    n = n.parentElement;
  }
  return false;
}

type Gesture = { x: number; y: number; t: number; axis: 'v' | 'n' | null; dy: number };

export function useSheetDrag(opts: { visible: boolean; onClosed: () => void }) {
  const { visible, onClosed } = opts;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const g = useRef<Gesture>({ x: 0, y: 0, t: 0, axis: null, dy: 0 });
  const closing = useRef(false);
  const raf = useRef(0);
  const timer = useRef(0);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const clearTimers = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (timer.current) window.clearTimeout(timer.current);
    raf.current = 0;
    timer.current = 0;
  };

  const place = (y: number) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = y > 0 ? `translate3d(0,${y}px,0)` : '';
    el.style.opacity = y > 0 ? String(1 - Math.min(0.3, (y / window.innerHeight) * 0.5)) : '';
  };

  const animateTo = (y: number, ms: number, done?: () => void) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}`;
    place(y);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      if (sheetRef.current) {
        sheetRef.current.style.transition = '';
        sheetRef.current.style.willChange = '';
      }
      done?.();
    }, ms + 20);
  };

  // 閉じる（ボタン・スワイプ・その他すべての経路でこれを使う）
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    clearTimers();
    if (motionDisabled() || !sheetRef.current) {
      closing.current = false;
      onClosedRef.current();
      return;
    }
    animateTo(window.innerHeight, CLOSE_MS, () => {
      closing.current = false;
      onClosedRef.current();
    });
  }, []);

  // 開く: 表示された直後に、下から滑り上がる
  useLayoutEffect(() => {
    if (!visible) {
      clearTimers();
      closing.current = false;
      return;
    }
    const el = sheetRef.current;
    if (!el || motionDisabled()) return;
    el.style.transition = 'none';
    el.style.transform = 'translate3d(0,100%,0)';
    void el.offsetHeight; // 初期位置を確定させてから動かす
    animateTo(0, OPEN_MS);
  }, [visible]);

  useEffect(() => clearTimers, []);

  const finish = () => {
    const d = g.current;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (d.axis !== 'v') {
      d.axis = null;
      return;
    }
    const vel = d.dy / Math.max(1, performance.now() - d.t);
    d.axis = null;
    if (d.dy > CLOSE_DIST || (d.dy > FLICK_DIST && vel > FLICK_VEL)) {
      close();
    } else if (motionDisabled()) {
      place(0);
      if (sheetRef.current) sheetRef.current.style.willChange = '';
    } else {
      animateTo(0, SNAP_MS); // 途中で離したら元に戻る
    }
  };

  const dragProps = {
    onTouchStart: (e: React.TouchEvent) => {
      if (closing.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      // 歌詞・キューなど、中身がスクロール済みのときは閉じる操作にしない
      const scrolled = insideScrolledArea(e.target, e.currentTarget);
      g.current = { x: t.clientX, y: t.clientY, t: performance.now(), axis: scrolled ? 'n' : null, dy: 0 };
      if (timer.current) {
        window.clearTimeout(timer.current); // 元に戻る途中で触られたら、そこから追従
        timer.current = 0;
      }
    },
    onTouchMove: (e: React.TouchEvent) => {
      const d = g.current;
      if (closing.current || d.axis === 'n') return;
      const t = e.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (d.axis === null) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        d.axis = Math.abs(dy) > Math.abs(dx) && dy > 0 ? 'v' : 'n';
        if (d.axis !== 'v') return;
        if (sheetRef.current) {
          sheetRef.current.style.transition = 'none';
          sheetRef.current.style.willChange = 'transform, opacity'; // ドラッグ中だけ
        }
      }
      d.dy = Math.max(0, dy);
      if (motionDisabled() || raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        place(g.current.dy);
      });
    },
    onTouchEnd: finish,
    onTouchCancel: finish,
  };

  return { sheetRef, dragProps, close };
}
