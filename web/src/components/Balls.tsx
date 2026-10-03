import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

type Props = {
  digits: unknown[] | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'classic' | 'gold';
  /** Accessible name prefix, e.g. "XGBoost". */
  label?: string;
  /** Animate in when digits change. */
  animate?: boolean;
};

/** Single display character per slot, so stray API values never break the layout. */
function digitChar(d: unknown): string {
  const s = String(d ?? '').replace(/\s+/g, '');
  return s ? s.slice(-1) : '?';
}

/** Three number balls in the logo's green / gold / red. */
export function Balls({ digits, size = 'md', tone = 'classic', label, animate = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const valid = Array.isArray(digits) && digits.length === 3;
  const chars = valid ? digits.map(digitChar) : ['–', '–', '–'];
  const key = chars.join('');

  useLayoutEffect(() => {
    if (!animate || !valid || !ref.current) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(ref.current!.children, {
        scale: 0.4,
        rotate: -90,
        opacity: 0,
        duration: 0.6,
        ease: 'back.out(1.8)',
        stagger: 0.09,
      });
    });
    return () => mm.revert();
  }, [key, animate, valid]);

  const name = valid ? `${label ? `${label}: ` : ''}${chars.join(' ')}` : `${label ? `${label}: ` : ''}no numbers`;

  return (
    <div
      ref={ref}
      className={`balls balls--${size}${tone === 'gold' ? ' balls--gold' : ''}`}
      role="img"
      aria-label={name}
    >
      {chars.map((c, i) => (
        <div key={i} className={`ball ball--${valid ? i + 1 : 'empty'}`}>
          <span aria-hidden>{c}</span>
        </div>
      ))}
    </div>
  );
}
