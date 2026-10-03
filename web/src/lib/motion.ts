import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';

/**
 * Staggered fade-up for every `[data-reveal]` inside `scope` (GSAP).
 * Skipped entirely when the user prefers reduced motion.
 */
export function useReveal(scope: RefObject<HTMLElement | null>, deps: unknown[] = []): void {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const items = scope.current!.querySelectorAll('[data-reveal]');
      if (!items.length) return;
      gsap.from(items, {
        y: 18,
        opacity: 0,
        duration: 0.55,
        ease: 'power3.out',
        stagger: 0.07,
        clearProps: 'transform,opacity',
      });
    });
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
