import React, { useEffect, useRef } from 'react';

/**
 * 再生画面の曲名。枠に収まるときは静止、収まらないときだけ自動で横に流れる。
 * 横スクロール領域なので、指で好きな位置まで動かせる。
 * API消費: 0ユニット（YouTube APIは呼ばない）。
 */

const SPEED_PX_PER_SEC = 30;
const WAIT_START_MS = 2000;
const RESUME_AFTER_TOUCH_MS = 3000;
/** 曲名の終わりと次の先頭の間の空白（半角スペース約8個ぶん） */
const GAP_EM = 2.2;

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
  /** 指定すると文字サイズ・色などの見た目クラスを丸ごと置き換える（ミニプレーヤー用） */
  className?: string;
  as?: 'h2' | 'h4';
}

export const MarqueeTitle: React.FC<MarqueeTitleProps> = ({ title, compact = false, className, as = 'h2' }) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const Tag = as;
  const aRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const bRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const a = aRef.current;
    const gap = gapRef.current;
    const b = bRef.current;
    if (!el || !a || !gap || !b) return;
    el.scrollLeft = 0; // 曲が変わったら先頭から

    let raf = 0;
    let running = false;
    let last = 0;
    let pos = 0; // 自動スクロール中の小数位置
    let expected = 0; // 自動で最後にセットした scrollLeft（ユーザー操作との区別用）
    let phase: 'start' | 'move' = 'start';
    let phaseLeft = WAIT_START_MS;
    let touching = false;
    let resumeAt = 0; // この時刻まで自動スクロール停止
    let userMoved = false;

    // 曲名単体が枠より広いときだけ「流す」。広いときだけ 空白＋2つ目の曲名 を表示する
    const overflows = () => a.offsetWidth - el.clientWidth > 1;
    const syncCopy = () => {
      const d = overflows() ? 'inline-block' : 'none';
      gap.style.display = d;
      b.style.display = d;
    };
    // 1周ぶんの長さ（曲名＋空白）。ここまで進むと2つ目が先頭と同じ見た目になる
    const period = () => b.offsetLeft - a.offsetLeft;
    const canAuto = () => !motionDisabled() && !document.hidden && overflows();

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
        if (pos <= 1) { phase = 'start'; phaseLeft = WAIT_START_MS; }
        else phase = 'move';
      }
      const loop = period();
      if (phase === 'move') {
        pos += (SPEED_PX_PER_SEC * dt) / 1000;
        if (pos >= loop) {
          // 2つ目の曲名が先頭に来たので、見た目を変えずに位置を戻してループ。先頭で少し止まる
          pos = 0;
          phase = 'start';
          phaseLeft = WAIT_START_MS;
        }
        el.scrollLeft = pos;
        expected = el.scrollLeft;
      } else {
        phaseLeft -= dt;
        if (phaseLeft <= 0) phase = 'move';
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
      // 手動でも途切れなくループ：1周ぶんを超えたら見た目を変えずに戻す
      const loop = period();
      if (overflows() && loop > 0 && el.scrollLeft >= loop) {
        el.scrollLeft -= loop;
        expected = el.scrollLeft;
        return;
      }
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
      syncCopy();
      if (overflows()) start();
      else {
        stop();
        el.scrollLeft = 0;
      }
    });
    syncCopy();
    ro.observe(el);
    ro.observe(a);

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
    <Tag
      ref={ref}
      className={`${className ?? `${compact ? 'text-[17px]' : 'text-[22px]'} font-semibold text-white leading-tight tracking-tight`} relative whitespace-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      <span ref={aRef} className="inline-block">{title}</span>
      <span ref={gapRef} aria-hidden="true" className="hidden" style={{ width: `${GAP_EM}em` }} />
      <span ref={bRef} aria-hidden="true" className="hidden select-none">{title}</span>
    </Tag>
  );
};

export default MarqueeTitle;
