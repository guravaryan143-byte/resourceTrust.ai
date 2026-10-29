import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const isCompactDevice = () => typeof window !== 'undefined' && (window.innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4);

export function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

// Backend reachability + database state from GET /health.
export function useApiHealth() {
  const [state, setState] = useState({ status: 'checking', database: 'unknown' });
  const check = useCallback(async () => {
    setState((s) => ({ ...s, status: 'checking' }));
    const h = await api.getHealth();
    setState({ status: !h.reachable ? 'offline' : h.database === 'connected' ? 'online' : 'degraded', database: h.database });
  }, []);
  useEffect(() => { check(); }, [check]);
  return { ...state, recheck: check };
}

// Unfiltered catalogue (first 100 active resources) used for hero and intelligence figures.
export function useCatalog() {
  const [state, setState] = useState({ status: 'loading', items: [], error: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const items = await api.listResources({ limit: 100 });
      setState({ status: 'ok', items, error: null });
    } catch (e) { setState({ status: 'error', items: [], error: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Server-side filtering with debounce, request cancellation and offset pagination.
export const PAGE_SIZE = 24;
export function useResourceSearch(filters, reloadKey) {
  const [state, setState] = useState({ status: 'loading', items: [], error: null, hasMore: false, loadingMore: false });
  const ctl = useRef(null);
  const key = JSON.stringify(filters);

  const run = useCallback(async (offset, append) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState((s) => (append ? { ...s, loadingMore: true } : { ...s, status: 'loading', error: null }));
    try {
      const rows = await api.listResources({ ...filters, limit: PAGE_SIZE, offset }, c.signal);
      setState((s) => ({ status: 'ok', items: append ? [...s.items, ...rows] : rows, error: null, hasMore: rows.length === PAGE_SIZE, loadingMore: false }));
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setState((s) => ({ ...s, status: append ? s.status : 'error', error: e.message, loadingMore: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { run(0, false); return () => ctl.current?.abort(); }, [run, reloadKey]);
  const loadMore = useCallback(() => run(state.items.length, true), [run, state.items.length]);
  return { ...state, retry: () => run(0, false), loadMore };
}

export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

// Adds .in to every [data-reveal] element as it enters the viewport.
export function useRevealOnScroll() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.in)');
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}
