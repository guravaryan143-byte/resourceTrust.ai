import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../hooks';

// Decorative cursor for fine pointers only. pointer-events:none, never replaces the system cursor.
export default function Cursor() {
  const dot = useRef(null); const ring = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine || prefersReducedMotion()) return undefined;
    setEnabled(true);
    document.documentElement.classList.add('has-cursor');
    let x = -100; let y = -100; let rx = -100; let ry = -100; let raf = 0;
    const move = (e) => {
      x = e.clientX; y = e.clientY;
      setLabel(!!e.target.closest?.('[data-cursor="explore"]'));
    };
    const tick = () => {
      rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove('has-cursor');
    };
  }, []);

  if (!enabled) return null;
  return (
    <>
      <div className="cur-dot" ref={dot} aria-hidden="true" />
      <div className={`cur-ring ${label ? 'explore' : ''}`} ref={ring} aria-hidden="true"><span>Explore</span></div>
    </>
  );
}
