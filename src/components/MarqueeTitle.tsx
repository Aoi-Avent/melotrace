import React, { useEffect, useRef } from 'react';

/**
 * 再生画面の曲名。枠に収まるときは静止、収まらないときだけ自動で横に流れる。
 * 横スクロール領域なので、指で好きな位置まで動かせる。
 * API消費: 0ユニット（YouTube APIは呼ばない）。
 */

const SPEED_PX_PER_SEC = 30;
const WAIT_START_MS = 2000;
const WAIT_END_MS = 1500;
const WAIT_RESET_MS = 2000;
const RESUME_AFTER_TOUCH_MS = 3000;

/** useSheetDrag.ts と同じ判定（アプリ内アニメーションOFF・省電力・視差効果を減らす） */
function motionDisabled(): boolean {
  if (typeof document === 'undefined') return true;
  const ds = document.documentElement.dataset;
  if (ds.anim === 'off' || ds.power === 'on') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface MarqueeTitleProps {
  title: string;
  compact?: boolean;
}

export const MarqueeTitle: React.FC<MarqueeTitleProps> = ({ title, compact = false }) => {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = 0; // 曲が変わったら先頭から

    let raf = 0;
    let running = false;
    let last = 0;
    let pos = 0; // 自動スクロール中の小数位置
    let expected = 0; // 自動で最後にセットした scrollLeft（ユーザー操作との区別用）
    let phase: 'start' | 'move' | 'end' | 'reset' = 'start';
    let phaseLeft = WAIT_START_MS;
    let touching = false;
    let resumeAt = 0; // この時刻まで自動スクロール停止
    let userMoved = false;

    const maxScroll = () => Math.max(0, el.scrollWidth - el.clientWidth);
    const canAuto = () => !motionDisabled() && !document.hidden && maxScroll() > 1;

    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(now - last, 100);
      last = now;
      if (!canAuto()) {
        stop();
        return;
      }
      if (touching || now < resumeAt) {
        userMoved = true;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (userMoved) {
        // ユーザー操作の後は、今の位置から再開
        userMoved = false;
        pos = el.scrollLeft;
        expected = pos;
        if (pos >= maxScroll() - 1) { phase = 'end'; phaseLeft = WAIT_END_MS; }
        else if (pos <= 1) { phase = 'start'; phaseLeft = WAIT_START_MS; }
        else phase = 'move';
      }
      const max = maxScroll();
      if (phase === 'move') {
        pos = Math.min(max, pos + (SPEED_PX_PER_SEC * dt) / 1000);
        el.scrollLeft = pos;
        expected = el.scrollLeft;
        if (pos >= max) { phase = 'end'; phaseLeft = WAIT_END_MS; }
      } else {
        phaseLeft -= dt;
        if (phaseLeft <= 0) {
          if (phase === 'start') phase = 'move';
          else if (phase === 'end') {
            pos = 0; el.scrollLeft = 0; expected = el.scrollLeft;
            phase = 'reset'; phaseLeft = WAIT_RESET_MS;
          } else { phase = 'move'; }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || !canAuto()) return;
      running = true;
      last = performance.now();
      pos = el.scrollLeft;
      expected = pos;
      raf = requestAnimationFrame(tick);
    };

    const userTouch = () => {
      touching = true;
      userMoved = true;
    };
    const userRelease = () => {
      touching = false;
      resumeAt = performance.now() + RESUME_AFTER_TOUCH_MS;
      start();
    };
    const onWheel = () => {
      userMoved = true;
      resumeAt = performance.now() + RESUME_AFTER_TOUCH_MS;
    };
    // 自動で動かした分（expected と一致）は無視し、それ以外はユーザー操作とみなす
    const onScroll = () => {
      if (Math.abs(el.scrollLeft - expected) > 1.5) {
        userMoved = true;
        resumeAt = performance.now() + RESUME_AFTER_TOUCH_MS;
        expected = el.scrollLeft;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    el.addEventListener('touchstart', userTouch, { passive: true });
    el.addEventListener('touchend', userRelease, { passive: true });
    el.addEventListener('touchcancel', userRelease, { passive: true });
    el.addEventListener('pointerdown', userTouch);
    el.addEventListener('pointerup', userRelease);
    el.addEventListener('pointercancel', userRelease);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    // 収まるか／収まらないかを測る。収まらなければ開始、収まれば停止
    const ro = new ResizeObserver(() => {
      if (maxScroll() > 1) start();
      else stop();
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    // 設定（アニメーションOFF等）が切り替わったら追従
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onMotionChange = () => (motionDisabled() ? stop() : start());
    mq?.addEventListener?.('change', onMotionChange);
    const mo = new MutationObserver(onMotionChange);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-anim', 'data-power'] });

    start();

    return () => {
      // 再生画面が閉じる（アンマウント）／曲が変わるときに rAF を止める
      stop();
      ro.disconnect();
      mo.disconnect();
      mq?.removeEventListener?.('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibility);
      el.removeEventListener('touchstart', userTouch);
      el.removeEventListener('touchend', userRelease);
      el.removeEventListener('touchcancel', userRelease);
      el.removeEventListener('pointerdown', userTouch);
      el.removeEventListener('pointerup', userRelease);
      el.removeEventListener('pointercancel', userRelease);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
    };
  }, [title]);

  return (
    <h2
      ref={ref}
      className={`${compact ? 'text-[17px]' : 'text-[22px]'} font-semibold text-white leading-tight tracking-tight whitespace-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      <span className="inline-block">{title}</span>
    </h2>
  );
};

export default MarqueeTitle;
