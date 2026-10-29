import { useMemo, useState } from 'react';
import { MapPin, Search, Users, GraduationCap, ArrowUpRight } from 'lucide-react';
import { useDebounced, useResourceSearch } from '../hooks';
import ResourceVisual from './ResourceVisual';
import { LoadingSkeleton, EmptyState, ErrorState } from './States';

// Availability maps to the backend `status_filter`. "archived" is deliberately not offered.
const AVAILABILITY = [['active', 'Open for requests'], ['paused', 'Paused'], ['maintenance', 'In maintenance']];
const SORTS = [['newest', 'Newest'], ['name', 'Name A–Z'], ['deposit', 'Lowest deposit'], ['capacity', 'Largest capacity']];
const SORTERS = {
  newest: null,
  name: (a, b) => a.name.localeCompare(b.name),
  deposit: (a, b) => Number(a.deposit_amount) - Number(b.deposit_amount),
  capacity: (a, b) => b.capacity - a.capacity,
};
const money = (v) => (Number(v) > 0 ? `Deposit ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'No deposit');

export function ResourceCard({ r, onOpen, index }) {
  return (
    <article className="card" style={{ '--i': index % 9 }} data-cursor="explore">
      <ResourceVisual id={r.id} category={r.category} />
      <div className="card-body">
        <div className="card-top"><span className="tag">{r.category}</span><span className={`status ${r.status}`}><i />{r.status === 'active' ? 'Available to request' : r.status}</span></div>
        <h3>{r.name}</h3>
        <p className="meta"><MapPin size={14} />{r.location}{r.institution ? ` · ${r.institution}` : ''}</p>
        <p className="meta"><Users size={14} />Capacity {r.capacity} · {money(r.deposit_amount)}</p>
        {r.requires_training && <p className="meta warn"><GraduationCap size={14} />Training: {r.required_qualification}</p>}
        <button type="button" className="link-btn" onClick={() => onOpen(r)} aria-label={`View details for ${r.name}`}>View details <ArrowUpRight size={15} /></button>
      </div>
    </article>
  );
}

export default function ResourceDiscovery({ filters, setFilters, categories, reloadKey, onOpen }) {
  const [sort, setSort] = useState('newest');
  const q = useDebounced(filters.q);
  const location = useDebounced(filters.location);
  const server = useMemo(() => ({
    q, location, category: filters.category, status_filter: filters.status,
    requires_training: filters.training === 'any' ? undefined : filters.training === 'yes',
  }), [q, location, filters.category, filters.status, filters.training]);
  const res = useResourceSearch(server, reloadKey);

  const items = useMemo(() => {
    const fn = SORTERS[sort];
    return fn ? [...res.items].sort(fn) : res.items;
  }, [res.items, sort]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const clear = () => setFilters({ q: '', location: '', category: '', status: 'active', training: 'any' });
  const dirty = filters.q || filters.location || filters.category || filters.status !== 'active' || filters.training !== 'any';

  return (
    <section id="discover" className="section" aria-labelledby="discover-title">
      <div className="wrap">
        <p className="eyebrow" data-reveal>01 — Discover</p>
        <h2 id="discover-title" data-reveal>Find what you need, <em>nearby.</em></h2>

        <form className="search" role="search" onSubmit={(e) => e.preventDefault()} data-reveal>
          <label className="field grow"><span className="sr">Search resources</span><Search size={18} />
            <input type="search" placeholder="What do you need access to?" value={filters.q} onChange={(e) => set({ q: e.target.value })} /></label>
          <label className="field"><span className="sr">Location</span><MapPin size={18} />
            <input type="text" placeholder="Location" value={filters.location} onChange={(e) => set({ location: e.target.value })} /></label>
          <label className="select"><span>Availability</span>
            <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>{AVAILABILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="select"><span>Training</span>
            <select value={filters.training} onChange={(e) => set({ training: e.target.value })}>
              <option value="any">Any</option><option value="no">No training needed</option><option value="yes">Training required</option></select></label>
          <label className="select"><span>Sort (loaded results)</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </form>

        <div className="chips" role="group" aria-label="Filter by category" data-reveal>
          <button type="button" className={`chip ${filters.category ? '' : 'on'}`} aria-pressed={!filters.category} onClick={() => set({ category: '' })}>All</button>
          {categories.map((c) => (
            <button type="button" key={c} className={`chip ${filters.category.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} aria-pressed={filters.category.toLowerCase() === c.toLowerCase()} onClick={() => set({ category: c })}>{c}</button>
          ))}
          {categories.length === 0 && <span className="chips-note">Categories appear once resources are listed.</span>}
        </div>

        <p className="result-line" aria-live="polite">
          {res.status === 'ok' && `${items.length}${res.hasMore ? '+' : ''} ${items.length === 1 ? 'resource' : 'resources'}`}
          {dirty && <button type="button" className="link-btn inline" onClick={clear}>Clear filters</button>}
        </p>

        {res.status === 'loading' && <LoadingSkeleton />}
        {res.status === 'error' && <ErrorState message={res.error} onRetry={res.retry} />}
        {res.status === 'ok' && items.length === 0 && (
          <EmptyState title={dirty ? 'No resources match these filters' : 'No resources listed yet'}
            body={dirty ? 'Try a broader search, another location, or clear the filters.' : 'Be the first to put an idle resource to work.'}
            action={dirty ? <button type="button" className="btn ghost" onClick={clear}>Clear filters</button> : <a className="btn primary" href="#list">List a resource</a>} />
        )}
        {res.status === 'ok' && items.length > 0 && (
          <>
            <div className="grid">{items.map((r, i) => <ResourceCard key={r.id} r={r} index={i} onOpen={onOpen} />)}</div>
            {res.hasMore && <div className="center"><button type="button" className="btn ghost" onClick={res.loadMore} disabled={res.loadingMore}>{res.loadingMore ? 'Loading…' : 'Load more'}</button></div>}
          </>
        )}
      </div>
    </section>
  );
}
