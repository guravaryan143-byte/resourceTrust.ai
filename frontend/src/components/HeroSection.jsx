import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import ResourceNetworkCanvas, { NETWORK_NODES } from './ResourceNetworkCanvas';

function Stat({ label, value, note }) {
  return <div className="stat"><b>{value}</b><span>{label}</span>{note && <em>{note}</em>}</div>;
}

export default function HeroSection({ health, catalog, onExplore, onNode }) {
  const wrap = useRef(null);
  const ok = catalog.status === 'ok';
  const cats = new Set(catalog.items.map((r) => r.category.trim().toLowerCase())).size;
  const locs = new Set(catalog.items.map((r) => r.location.trim().toLowerCase())).size;
  const count = catalog.items.length >= 100 ? '100+' : String(catalog.items.length);

  const apiLabel = { checking: 'Checking API…', online: 'API online · database connected', degraded: 'API up · database unavailable', offline: 'API unreachable' }[health.status];

  return (
    <section id="home" className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow"><span className={`dot ${health.status}`} aria-hidden="true" />{apiLabel}</p>
          <h1 id="hero-title">Your next resource <br /><em>is already out there.</em></h1>
          <p className="lede">Find the equipment, tools, and spaces you need — without buying what someone else already owns.</p>
          <div className="cta-row">
            <button type="button" className="btn primary lg" onClick={onExplore}>Explore resources <ArrowRight size={18} /></button>
            <a href="#list" className="btn ghost lg">Share a resource</a>
          </div>
          <div className="stats" aria-live="polite">
            {ok ? (
              <>
                <Stat value={count} label="active resources" />
                <Stat value={cats} label={cats === 1 ? 'category' : 'categories'} />
                <Stat value={locs} label={locs === 1 ? 'location' : 'locations'} />
              </>
            ) : (
              <p className="stats-note">{catalog.status === 'loading' ? 'Loading live figures…' : 'Live figures appear when the API is reachable.'}</p>
            )}
          </div>
        </div>
        <div className="net" ref={wrap} data-cursor="explore">
          <ResourceNetworkCanvas wrapRef={wrap} />
          <div className="net-core" aria-hidden="true">Discover</div>
          {NETWORK_NODES.map((n, i) => (
            <button key={n.id} type="button" className="net-node" style={{ '--x': `${n.x * 100}%`, top: `${n.y * 100}%`, '--k': i % 2 ? 1 : -1 }} onClick={() => onNode(n.q)} aria-label={`Search for ${n.label.toLowerCase()}`}>
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </div>
      <a href="#discover" className="scroll-hint" aria-label="Scroll to discovery"><span /></a>
    </section>
  );
}
