import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { pointerVelocity, resolveWeekSwipe } from '../gesture';

const SETTLE_MS = 340;

export function useWeekPager({ week, weekCount, onWeekChange, onTransitionStart, onTransitionEnd }) {
  const pagerRef = useRef(null);
  const dragRef = useRef(null);
  const settlingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const timerRef = useRef(null);
  const frameRef = useRef(null);
  const pendingOffsetRef = useRef(0);

  const applyPagerOffset = useCallback((pixels) => {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.style.setProperty('--drag-x', `${pixels}px`);
  }, []);

  const setPagerOffset = useCallback((pixels, animate = false) => {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.classList.toggle('settling', animate);
    pager.style.setProperty('--settle-duration', `${SETTLE_MS}ms`);
    pendingOffsetRef.current = pixels;
    if (animate) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      applyPagerOffset(pixels);
      return;
    }
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      applyPagerOffset(pendingOffsetRef.current);
    });
  }, [applyPagerOffset]);

  const resetPager = useCallback(() => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    settlingRef.current = false;
    dragRef.current = null;
    suppressClickRef.current = false;
    const pager = pagerRef.current;
    if (!pager) return;
    pager.classList.remove('settling', 'dragging');
    pager.style.setProperty('--drag-x', '0px');
  }, []);

  useEffect(() => resetPager, [resetPager]);

  const finishWeekSlide = useCallback((direction) => {
    const next = Math.min(weekCount, Math.max(1, week + direction));
    if (next === week || settlingRef.current) return;
    settlingRef.current = true;
    onTransitionStart?.(next);
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    setPagerOffset(-direction * width, true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pager = pagerRef.current;
      if (pager) {
        pager.classList.remove('settling');
        pager.classList.add('committing');
      }
      // Keep the outgoing target page in place until React has synchronously
      // committed the new three-page window, then reset the offset before the
      // browser can paint. This avoids the one-frame old-page flash seen in
      // Android WebView at the end of a swipe.
      flushSync(() => onWeekChange(next));
      if (pager) {
        pager.style.setProperty('--drag-x', '0px');
        requestAnimationFrame(() => pager.classList.remove('committing'));
      }
      onTransitionEnd?.(next);
      settlingRef.current = false;
    }, SETTLE_MS + 20);
  }, [onTransitionEnd, onTransitionStart, onWeekChange, setPagerOffset, week, weekCount]);

  const navigateWeek = useCallback((value, absolute = false) => {
    if (settlingRef.current) return;
    const next = Math.min(weekCount, Math.max(1, absolute ? value : week + value));
    if (next === week) return;
    if (Math.abs(next - week) === 1 && pagerRef.current) finishWeekSlide(next > week ? 1 : -1);
    else {
      setPagerOffset(0, false);
      onTransitionStart?.(next);
      onWeekChange(next);
      onTransitionEnd?.(next);
    }
  }, [finishWeekSlide, onTransitionEnd, onTransitionStart, onWeekChange, setPagerOffset, week, weekCount]);

  const onPointerDown = useCallback((event) => {
    if (settlingRef.current || event.button > 0) return;
    const now = performance.now();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      axis: null,
      lastX: 0,
      samples: [{ x: event.clientX, y: event.clientY, time: now }]
    };
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || settlingRef.current) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    const now = performance.now();
    drag.samples.push({ x: event.clientX, y: event.clientY, time: now });
    drag.samples = drag.samples.filter((sample) => now - sample.time <= 140);
    if (!drag.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 5) {
      drag.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.08 ? 'x' : 'y';
      if (drag.axis === 'x') {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pagerRef.current?.classList.add('dragging');
      }
    }
    if (drag.axis !== 'x') return;
    event.preventDefault();
    suppressClickRef.current = true;
    let offset = deltaX;
    if ((week === 1 && offset > 0) || (week === weekCount && offset < 0)) offset *= 0.18;
    drag.lastX = offset;
    setPagerOffset(offset, false);
  }, [setPagerOffset, week, weekCount]);

  const onPointerEnd = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    pagerRef.current?.classList.remove('dragging');
    // Vertical scrolling is intentionally left to Android WebView's compositor.
    // Adding a second scripted smooth scroll here fights native inertia and
    // causes the translucent timetable layers to flicker on some vivo devices.
    if (drag.axis === 'y') return;
    if (drag.axis !== 'x') return;
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    const direction = resolveWeekSwipe({
      offset: drag.lastX,
      velocity: pointerVelocity(drag.samples, 'x'),
      width,
      canPrevious: week > 1,
      canNext: week < weekCount
    });
    if (direction) finishWeekSlide(direction);
    else {
      settlingRef.current = true;
      setPagerOffset(0, true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        pagerRef.current?.classList.remove('settling');
        settlingRef.current = false;
      }, SETTLE_MS);
    }
    setTimeout(() => { suppressClickRef.current = false; }, 120);
  }, [finishWeekSlide, setPagerOffset, week, weekCount]);

  return {
    pagerRef,
    suppressClickRef,
    navigateWeek,
    resetPager,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd
    }
  };
}
