import { useEffect, useRef, useState } from 'react';

/** Whether this reader has asked for less movement. Checked once, at mount. */
function prefersStill(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * True once the element has entered the viewport, and true forever after.
 *
 * Reveals fire once and never reverse: content that fades back out as you
 * scroll up is disorienting, and re-animating something a reader has already
 * seen reads as a glitch rather than as polish.
 *
 * With reduced motion the initial state is already `true`, so the element is
 * simply present from the start — the observer is never even created.
 */
export function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(prefersStill);

  useEffect(() => {
    const element = ref.current;
    if (!element || shown) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      // Trigger a little before the element is fully in view, so the motion is
      // finishing as it reaches a comfortable reading position.
      { threshold, rootMargin: '0px 0px -12% 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, shown]);

  return { ref, shown };
}

/**
 * How far a tall element has travelled through the viewport, from 0 to 1.
 *
 * Used to drive scroll-linked animation, where the reader scrubs the motion
 * rather than merely triggering it. Reads are throttled to one per frame —
 * `getBoundingClientRect()` in a raw scroll handler forces layout on every
 * event and is the usual reason a page like this feels heavy.
 *
 * Returns a resting 1 under reduced motion, so anything driven by it renders in
 * its finished state instead of frozen half-drawn.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(() => (prefersStill() ? 1 : 0));

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersStill()) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) {
        setProgress(1);
        return;
      }
      setProgress(Math.min(1, Math.max(0, -rect.top / travel)));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    // Deferred rather than called straight away: a synchronous read here would
    // set state during the effect and cascade an extra render.
    schedule();

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, progress };
}

/** Maps a slice of overall progress onto its own 0..1 range. */
export function stage(progress: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (progress - from) / (to - from)));
}
