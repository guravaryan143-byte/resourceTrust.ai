import { useEffect, useRef, useState } from 'react';
import { isCompactDevice } from '../hooks';

const TOTAL = 2400; // ms until fade starts; fade adds ~350ms

export default function IntroSequence({ onDone }) {
  const canvas = useRef(null);
  const [t, setT] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    setTimeout(onDone, 350);
  };

  useEffect(() => {
    const cv = canvas.current; const ctx = cv.getContext('2d');
    const compact = isCompactDevice();
    const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 2);
    let w = 0; let h = 0; let nodes = []; let raf = 0; const start = performance.now();

    const layout = () => {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = compact ? 9 : 18;
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      nodes = Array.from({ length: count }, () => ({ x: w * (0.1 + rnd() * 0.8), y: h * (0.12 + rnd() * 0.76) }));
    };
    layout();
    window.addEventListener('resize', layout);

    const draw = (now) => {
      const el = now - start; setT(el);
      ctx.clearRect(0, 0, w, h);
      const gridA = Math.min(1, el / 500) * 0.35;
      const step = compact ? 56 : 64;
      ctx.strokeStyle = `rgba(255,255,255,${gridA * 0.18})`; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      const cx = w / 2; const cy = h / 2;
      const lineP = Math.max(0, Math.min(1, (el - 800) / 800));
      nodes.forEach((n, i) => {
        const lit = Math.max(0, Math.min(1, (el - (250 + i * (500 / nodes.length))) / 250));
        if (lineP > 0) {
          ctx.strokeStyle = `rgba(198,255,61,${0.28 * lit})`; ctx.beginPath(); ctx.moveTo(n.x, n.y);
          ctx.lineTo(n.x + (cx - n.x) * lineP, n.y + (cy - n.y) * lineP); ctx.stroke();
        }
        ctx.fillStyle = `rgba(198,255,61,${0.15 + 0.85 * lit})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, 2 + 2 * lit, 0, Math.PI * 2); ctx.fill();
      });
      if (el < TOTAL + 400) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const timer = setTimeout(finish, TOTAL);
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', layout); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`intro ${leaving ? 'leaving' : ''}`} role="presentation">
      <canvas ref={canvas} aria-hidden="true" />
      <div className="intro-mark">resource<b>Trust</b>.ai</div>
      <div className="intro-copy">
        <h2 aria-label="The world has enough. It just needs to connect.">
          <span className={t > 1000 ? 'on' : ''}>THE WORLD HAS ENOUGH.</span>
          <span className={t > 1250 ? 'on' : ''}>IT JUST NEEDS TO CONNECT.</span>
        </h2>
        <p className={t > 1600 ? 'on' : ''}>Discover available equipment and spaces. Share what you own. Turn idle resources into useful opportunities.</p>
      </div>
      <button type="button" className="intro-skip" onClick={finish} data-autofocus>Skip intro</button>
    </div>
  );
}
