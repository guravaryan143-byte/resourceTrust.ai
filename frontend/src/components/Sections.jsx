import { useMemo } from 'react';
import { Search, Handshake, Layers } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    [Search, '01', 'Discover', 'Find equipment and spaces available around you.'],
    [Handshake, '02', 'Connect', 'Review the details and send a booking request. The owner approves, rejects or waitlists it.'],
    [Layers, '03', 'Make more possible', 'Use what already exists instead of buying duplicates.'],
  ];
  return (
    <section id="how" className="section" aria-labelledby="how-title">
      <div className="wrap">
        <p className="eyebrow" data-reveal>02 — How it works</p>
        <h2 id="how-title" data-reveal>Three steps. <em>No guesswork.</em></h2>
        <ol className="steps">
          {steps.map(([Icon, n, t, d], i) => (
            <li key={n} data-reveal style={{ '--i': i }}><span className="step-n">{n}</span><Icon size={22} strokeWidth={1.5} /><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ResourceIntelligence({ catalog }) {
  const stats = useMemo(() => {
    const by = (key) => { const m = new Map(); catalog.items.forEach((r) => { const k = r[key].trim(); m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]); };
    return { cats: by('category'), locs: by('location') };
  }, [catalog.items]);
  const ok = catalog.status === 'ok' && catalog.items.length > 0;
  const max = ok ? stats.cats[0][1] : 1;
  return (
    <section id="intelligence" className="section alt" aria-labelledby="intel-title">
      <div className="wrap intel">
        <div>
          <p className="eyebrow" data-reveal>03 — Resource intelligence</p>
          <h2 id="intel-title" data-reveal>Idle doesn’t have to <em>mean unused.</em></h2>
          <p className="lede" data-reveal>Every listing turns hidden capacity into something people can find. These figures are calculated from the active listings the API returns right now.</p>
          {ok ? (
            <div className="panel bars" data-reveal>
              <div className="stats big"><div className="stat"><b>{catalog.items.length >= 100 ? '100+' : catalog.items.length}</b><span>active listings</span></div>
                <div className="stat"><b>{stats.cats.length}</b><span>categories</span></div><div className="stat"><b>{stats.locs.length}</b><span>locations</span></div></div>
              <ul className="barlist" aria-label="Listings by category">
                {stats.cats.slice(0, 6).map(([c, n]) => (
                  <li key={c}><span>{c}</span><div className="bar"><i style={{ width: `${(n / max) * 100}%` }} /></div><b>{n}</b></li>))}
              </ul>
              {catalog.items.length >= 100 && <p className="faint">Based on the first 100 active listings.</p>}
            </div>
          ) : (
            <p className="notice" data-reveal>{catalog.status === 'loading' ? 'Loading live figures…' : catalog.status === 'error' ? 'Live figures unavailable: the API could not be reached.' : 'No listings yet, so there are no figures to show.'}</p>
          )}
        </div>
        <svg className="concept" viewBox="0 0 400 320" role="img" aria-label="Diagram: providers on the left connect through the platform to people who need access on the right" data-reveal>
          {[60, 130, 200, 270].map((y, i) => <g key={y}><circle cx="50" cy={y} r="8" className="n-supply" /><path d={`M58 ${y} C150 ${y} 150 160 200 160`} className="l-flow" style={{ '--d': `${i * 0.4}s` }} /></g>)}
          {[80, 160, 240].map((y, i) => <g key={y}><circle cx="350" cy={y} r="8" className="n-demand" /><path d={`M342 ${y} C260 ${y} 260 160 200 160`} className="l-flow" style={{ '--d': `${i * 0.5}s` }} /></g>)}
          <circle cx="200" cy="160" r="26" className="n-core" /><text x="200" y="165" textAnchor="middle">match</text>
          <text x="50" y="305" textAnchor="middle" className="cap">Providers</text><text x="350" y="305" textAnchor="middle" className="cap">People in need</text>
        </svg>
      </div>
    </section>
  );
}

export function TrustSection() {
  const done = ['Password-protected accounts with signed, expiring sessions', 'Role-based permissions: member, owner, manager, admin', 'Owner approval for every booking, with waitlisting on time conflicts', 'Manager/admin-verified eligibility for training-gated resources', 'Condition reports, incident review and an audit history in the API', 'In-app notifications stored in the database'];
  const next = ['Identity verification of owners', 'Payments or deposit capture', 'Insurance or damage cover', 'Email / SMS delivery of notifications', 'Photo upload storage', 'Automatic waitlist promotion'];
  return (
    <section id="trust" className="section" aria-labelledby="trust-title">
      <div className="wrap">
        <p className="eyebrow" data-reveal>05 — Trust and safety</p>
        <h2 id="trust-title" data-reveal>Sharing works when <em>trust comes first.</em></h2>
        <div className="two-col">
          <div className="panel" data-reveal><h3>Implemented today</h3><ul className="ticks">{done.map((d) => <li key={d}>{d}</li>)}</ul></div>
          <div className="panel muted" data-reveal><h3>Not built yet</h3><ul className="ticks off">{next.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="faint">We list these so nobody assumes protections that don’t exist.</p></div>
        </div>
      </div>
    </section>
  );
}

export function ImpactSection() {
  return (
    <section id="impact" className="section impact" aria-labelledby="impact-title">
      <svg className="impact-bg" viewBox="0 0 800 300" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 14 }, (_, i) => { const x = 40 + (i * 53) % 740; const y = 30 + (i * 97) % 240; return <circle key={i} cx={x} cy={y} r="3" className="imp-n" style={{ '--d': `${i * 0.18}s` }} />; })}
        <path className="imp-l" d="M40 30 L93 127 L146 224 L199 21 L252 118 L305 215 L358 12 L411 109 L464 206 L517 303" />
      </svg>
      <div className="wrap center">
        <p className="eyebrow" data-reveal>06 — Impact</p>
        <h2 id="impact-title" data-reveal>Use more. Waste less. <em>Build together.</em></h2>
        <p className="lede" data-reveal>Every shared drill, studio hour or lab bench is one fewer duplicate purchase. We’ll report utilisation once there’s enough real booking data to calculate it honestly; until then, no invented numbers.</p>
        <a className="btn primary lg" href="#discover" data-reveal>Start exploring</a>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer"><div className="wrap foot-in">
      <div><div className="wordmark">resource<b>Trust</b><i>.ai</i></div><p className="faint">The world has enough. It just needs to connect.</p></div>
      <nav aria-label="Footer"><a href="#discover">Discover</a><a href="#how">How it works</a><a href="#list">List a resource</a><a href="#trust">Trust</a></nav>
    </div></footer>
  );
}
