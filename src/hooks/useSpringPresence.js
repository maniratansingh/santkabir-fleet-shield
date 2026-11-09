import { useEffect, useRef, useState } from 'react';

const DEFAULT_RESPONSE = 0.28;
const DEFAULT_DAMPING = 1.0;

export function useSpringPresence(
  open,
  {
    response = DEFAULT_RESPONSE,
    dampingRatio = DEFAULT_DAMPING,
    fromScale = 0.96,
    fromX = 0,
    fromY = -6,
    transformOrigin = 'center',
  } = {}
) {
  const [mounted, setMounted] = useState(Boolean(open));
  const [progress, setProgress] = useState(open ? 1 : 0);

  const progressRef = useRef(progress);
  const rafRef = useRef(null);
  const openRef = useRef(open);
  const reducedMotionRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotionRef.current = query.matches; };
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (open) setMounted(true);

    const target = open ? 1 : 0;
    const start = progressRef.current;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const settle = () => {
      progressRef.current = target;
      setProgress(target);
      if (!openRef.current) setMounted(false);
    };

    if (reducedMotionRef.current || Math.abs(target - start) < 0.001) {
      settle();
      return undefined;
    }

    const stiffness = (2 * Math.PI / response) ** 2;
    const damping = 2 * dampingRatio * Math.sqrt(stiffness);
    let x = start;
    let v = 0;
    let last = performance.now();

    const step = (now) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      const acceleration = -stiffness * (x - target) - damping * v;
      v += acceleration * dt;
      x += v * dt;

      if (Math.abs(x - target) < 0.001 && Math.abs(v) < 0.01) {
        rafRef.current = null;
        settle();
        return;
      }

      progressRef.current = x;
      setProgress(x);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, response, dampingRatio]);

  const value = Math.max(0, Math.min(1, progress));
  const translateX = fromX * (1 - value);
  const translateY = fromY * (1 - value);
  const scale = fromScale + (1 - fromScale) * value;

  return {
    mounted,
    progress: value,
    style: {
      opacity: value,
      transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
      transformOrigin,
      willChange: 'transform, opacity',
      pointerEvents: open ? 'auto' : 'none',
    },
  };
}
