import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DEFAULT_DETENTS = { peek: 88, half: 560, full: 680 };
const RESPONSE = 0.34;
const DAMPING_RATIO = 1.0;
const MOMENTUM_DECELERATION = 0.998;
const DRAG_THRESHOLD_PX = 5;

function computeDetents() {
  if (typeof window === 'undefined') return DEFAULT_DETENTS;
  const vh = window.innerHeight;
  const full = Math.min(680, Math.max(320, vh - 80));
  const half = Math.min(560, Math.max(220, full - 80));
  return { peek: 88, half, full };
}

function heightForDetent(detent, detents) {
  if (detent === 'full') return detents.full;
  if (detent === 'half') return detents.half;
  return detents.peek;
}

function nearestDetent(value, detents) {
  const entries = [
    ['peek', detents.peek],
    ['half', detents.half],
    ['full', detents.full],
  ];
  return entries.reduce((best, entry) =>
    Math.abs(entry[1] - value) < Math.abs(best[1] - value) ? entry : best
  )[0];
}

function projectMomentum(velocityPxPerSecond) {
  return (
    (velocityPxPerSecond / 1000) *
    MOMENTUM_DECELERATION /
    (1 - MOMENTUM_DECELERATION)
  );
}

function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function useDraggableSheet({
  detent = 'peek',
  onChangeDetent,
  disabled = false,
} = {}) {
  const [detents, setDetents] = useState(computeDetents);
  const [height, setHeight] = useState(() => heightForDetent(detent, computeDetents()));
  const [isDragging, setIsDragging] = useState(false);

  const heightRef = useRef(height);
  const detentRef = useRef(detent);
  const detentsRef = useRef(detents);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressDetentSyncRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const dragRef = useRef(null);

  useLayoutEffect(() => {
    const next = computeDetents();
    setDetents(next);
    detentsRef.current = next;
    const target = heightForDetent(detentRef.current, next);
    heightRef.current = target;
    setHeight(target);
  }, []);

  useEffect(() => { heightRef.current = height; }, [height]);
  useEffect(() => { detentRef.current = detent; }, [detent]);
  useEffect(() => { detentsRef.current = detents; }, [detents]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotionRef.current = query.matches; };
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const springTo = useCallback((target, initialVelocity = 0) => {
    stopAnimation();
    const start = heightRef.current;

    if (reducedMotionRef.current || Math.abs(target - start) < 0.5) {
      heightRef.current = target;
      setHeight(target);
      return;
    }

    const stiffness = (2 * Math.PI / RESPONSE) ** 2;
    const dampingRatio = Math.abs(initialVelocity) > 250 ? 0.82 : DAMPING_RATIO;
    const damping = 2 * dampingRatio * Math.sqrt(stiffness);
    const bounds = detentsRef.current;
    let x = start;
    let v = initialVelocity;
    let last = performance.now();

    const step = (now) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      const acceleration = -stiffness * (x - target) - damping * v;
      v += acceleration * dt;
      x += v * dt;
      x = Math.max(bounds.peek - 24, Math.min(bounds.full + 24, x));

      if (Math.abs(x - target) < 0.5 && Math.abs(v) < 5) {
        heightRef.current = target;
        setHeight(target);
        rafRef.current = null;
        return;
      }

      heightRef.current = x;
      setHeight(x);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [stopAnimation]);

  // Sync the sheet when another surface changes the detent (e.g. "Open fleet list").
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (suppressDetentSyncRef.current) {
      suppressDetentSyncRef.current = false;
      return;
    }
    springTo(heightForDetent(detent, detentsRef.current));
  }, [detent, detents, springTo]);

  useEffect(() => {
    const onResize = () => {
      const next = computeDetents();
      setDetents(next);
      detentsRef.current = next;
      const target = heightForDetent(detentRef.current, next);
      if (!isDraggingRef.current) springTo(target);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [springTo]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  const settle = useCallback((velocity) => {
    const bounds = detentsRef.current;
    const projected = heightRef.current + projectMomentum(velocity);
    const targetDetent = nearestDetent(projected, bounds);
    const targetHeight = heightForDetent(targetDetent, bounds);

    springTo(targetHeight, velocity);

    if (targetDetent !== detentRef.current && onChangeDetent) {
      suppressDetentSyncRef.current = true;
      onChangeDetent(targetDetent);
      setTimeout(() => { suppressDetentSyncRef.current = false; }, 300);
    }
  }, [onChangeDetent, springTo]);

  const onPointerDown = (event) => {
    if (disabled) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.currentTarget.setPointerCapture) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) {}
    }
    stopAnimation();
    suppressClickRef.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: heightRef.current,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      suppressClickRef.current = true;
    }

    const bounds = detentsRef.current;
    const raw = drag.startHeight - deltaY;
    let next = raw;

    if (raw < bounds.peek) {
      next = bounds.peek - rubberband(bounds.peek - raw, bounds.peek);
    } else if (raw > bounds.full) {
      next = bounds.full + rubberband(raw - bounds.full, bounds.full);
    }
    next = Math.max(bounds.peek - 48, Math.min(bounds.full + 48, next));

    const dt = Math.max(0.008, (event.timeStamp - drag.lastTime) / 1000);
    const instantaneous = -(event.clientY - drag.lastY) / dt;
    drag.velocity = drag.velocity * 0.7 + instantaneous * 0.3;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    heightRef.current = next;
    setHeight(next);
  };

  const finishDrag = (event, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.releasePointerCapture) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    dragRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);

    const velocity = cancelled ? 0 : Math.max(-3000, Math.min(3000, drag.velocity));
    settle(velocity);
  };

  const onPointerUp = (event) => finishDrag(event);
  const onPointerCancel = (event) => finishDrag(event, true);

  const cycleDetent = () => {
    const order = ['peek', 'half', 'full'];
    const index = order.indexOf(detentRef.current);
    const next = order[(index + 1) % order.length];
    if (onChangeDetent) onChangeDetent(next);
  };

  const onClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    cycleDetent();
  };

  const onKeyDown = (event) => {
    const order = ['peek', 'half', 'full'];
    const index = order.indexOf(detentRef.current);
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (index < order.length - 1 && onChangeDetent) onChangeDetent(order[index + 1]);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      if (index > 0 && onChangeDetent) onChangeDetent(order[index - 1]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChangeDetent?.('peek');
    } else if (event.key === 'End') {
      event.preventDefault();
      onChangeDetent?.('full');
    }
  };

  return {
    height,
    detents,
    isDragging,
    isExpanded: height > detents.peek + 12,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClick,
      onKeyDown,
      style: { touchAction: 'none', userSelect: 'none' },
    },
  };
}
