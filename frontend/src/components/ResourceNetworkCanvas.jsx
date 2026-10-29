import { useEffect, useRef } from 'react';
import { isCompactDevice, prefersReducedMotion } from '../hooks';

// Normalised layout (0..1) shared by the canvas (lines) and the HTML buttons placed over it.
export const NETWORK_NODES = [
  { id: 'tools', label: 'Tools', q: 'tool', x: 0.16, y: 0.30 },
  { id: 'workspaces', label: 'Workspaces', q: 'space', x: 0.30, y: 0.76 },
  { id: 'electronics', label: 'Electronics', q: 'laptop', x: 0.84, y: 0.26 },
  { id: 'machinery', label: 'Machinery', q: 'machine', x: 0.76, y: 0.74 },
  { id: 'studios', label: 'Studios', q: 'studio', x: 0.50, y: 0.10 },
  { id: 'labs', label: 'Labs', q: 'lab', x: 0.10, y: 0.58 },
  { id: 'events', label: 'Event spaces', q: 'event', x: 0.92, y: 0.52 },
];

export default function ResourceNetworkCanvas({ wrapRef }) {
  const cv = useRef(null);
  useEffect(() => {
    const canvas = cv.current; const ctx = canvas.getContext('2d');
    const reduce = prefersReducedMotion(); const compact = isCompactDevice();
    const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 2);
    let w = 0; let h = 0; let raf = 0; let visible = true; const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const motes = Array.from({ length: compact ? 0 : 38 }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: 0.12 + ((i * 37) % 100) / 100 * 0.42, s: 0.00008 + (i % 7) * 0.00002 }));

    const size = () => {
      const r = canvas.getBoundingClientRect(); w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    if (!compact && !reduce) window.addEventListener('pointermove', onMove, { passive: true });
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !reduce) raf = requestAnimationFrame(draw); });
    io.observe(canvas);

    function draw(now = 0) {
      raf = 0;
      pointer.x += (pointer.tx - pointer.x) * 0.06; pointer.y += (pointer.ty - pointer.y) * 0.06;
      if (wrapRef?.current) { wrapRef.current.style.setProperty('--px', pointer.x.toFixed(3)); wrapRef.current.style.setProperty('--py', pointer.y.toFixed(3)); }
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + pointer.x * 10; const cy = h / 2 + pointer.y * 10;
      const pulse = reduce ? 0.5 : (Math.sin(now / 900) + 1) / 2;

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.55);
      glow.addColorStop(0, 'rgba(91,140,255,0.16)'); glow.addColorStop(1, 'rgba(91,140,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

      motes.forEach((m) => {
        const a = m.a + now * m.s; const rr = m.r * Math.min(w, h) * 1.6;
        ctx.fillStyle = 'rgba(245,245,242,0.22)'; ctx.fillRect(cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.8, 1.4, 1.4);
      });

      NETWORK_NODES.forEach((n, i) => {
        const nx = (window.innerWidth < 640 ? Math.min(0.8, Math.max(0.2, n.x)) : n.x) * w + pointer.x * 16 * (i % 2 ? 1 : -1); const ny = n.y * h + pointer.y * 12;
        ctx.strokeStyle = 'rgba(198,255,61,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
        const p = reduce ? 0.5 : ((now / 2600) + i * 0.17) % 1;
        ctx.fillStyle = 'rgba(198,255,61,0.95)'; ctx.beginPath(); ctx.arc(nx + (cx - nx) * p, ny + (cy - ny) * p, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(198,255,61,0.35)'; ctx.beginPath(); ctx.arc(nx, ny, 5 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
      });

      ctx.strokeStyle = 'rgba(91,140,255,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, 26 + pulse * 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#F5F5F2'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    }
    draw(0);
    return () => { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', onMove); };
  }, [wrapRef]);
  return <canvas ref={cv} className="net-canvas" aria-hidden="true" />;
}
