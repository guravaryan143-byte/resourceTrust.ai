import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { useActiveSection, useApiHealth, useCatalog, useRevealOnScroll, prefersReducedMotion } from './hooks';
import IntroSequence from './components/IntroSequence';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import ResourceDiscovery from './components/ResourceDiscovery';
import ResourceDetails from './components/ResourceDetails';
import ResourceListingForm from './components/ResourceListingForm';
import AuthDialog from './components/AuthDialog';
import AccountPanel from './components/AccountPanel';
import { HowItWorks, ResourceIntelligence, TrustSection, ImpactSection, Footer } from './components/Sections';
import Toast from './components/Toast';
import Cursor from './components/Cursor';

const SECTIONS = ['home', 'discover', 'how', 'intelligence', 'list', 'trust', 'impact'];
const DEFAULT_FILTERS = { q: '', location: '', category: '', status: 'active', training: 'any' };
const introSeen = () => { try { return sessionStorage.getItem('rt_intro') === '1'; } catch { return false; } };

export default function App() {
  const [introDone, setIntroDone] = useState(() => prefersReducedMotion() || introSeen());
  const health = useApiHealth();
  const catalog = useCatalog();
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const active = useActiveSection(SECTIONS);
  useRevealOnScroll();

  const notify = useCallback((kind, message) => setToast({ kind, message, id: Date.now() }), []);
  const refreshAll = useCallback(() => { setReloadKey((k) => k + 1); catalog.reload(); }, [catalog]);

  const loadUser = useCallback(async () => {
    if (!api.tokenStore.get()) { setUser(null); return; }
    try { setUser(await api.getMe()); } catch { setUser(null); }
  }, []);
  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => {
    const out = () => { setUser(null); setAccountOpen(false); notify('error', 'Your session expired. Please sign in again.'); };
    window.addEventListener('rt:unauthorized', out);
    return () => window.removeEventListener('rt:unauthorized', out);
  }, [notify]);

  const finishIntro = useCallback(() => { try { sessionStorage.setItem('rt_intro', '1'); } catch { /* ignore */ } setIntroDone(true); }, []);

  const categories = useMemo(() => {
    const seen = new Map();
    catalog.items.forEach((r) => { const k = r.category.trim(); if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); });
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [catalog.items]);
  const owned = useMemo(() => (user ? catalog.items.filter((r) => r.owner_id === user.id) : []), [catalog.items, user]);

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  const onAuthed = async (justRegistered) => {
    await loadUser(); setAuthOpen(false);
    notify('success', justRegistered ? 'Account created and signed in.' : 'Signed in.');
  };
  const signOut = () => { api.tokenStore.clear(); setUser(null); setAccountOpen(false); notify('success', 'Signed out.'); };
  const needAuth = () => { setSelected(null); setAuthOpen(true); };

  return (
    <>
      {!introDone && <IntroSequence onDone={finishIntro} />}
      <a className="skip-link" href="#discover">Skip to resources</a>
      <Navbar active={active} user={user} onSignIn={() => setAuthOpen(true)} onAccount={() => setAccountOpen(true)} />
      <main>
        <HeroSection health={health} catalog={catalog} onExplore={() => scrollTo('discover')}
          onNode={(q) => { setFilters({ ...DEFAULT_FILTERS, q }); scrollTo('discover'); }} />
        <ResourceDiscovery filters={filters} setFilters={setFilters} categories={categories} reloadKey={reloadKey} onOpen={setSelected} />
        <HowItWorks />
        <ResourceIntelligence catalog={catalog} />
        <ResourceListingForm user={user} onNeedAuth={() => setAuthOpen(true)} onCreated={refreshAll} onToast={notify}
          onBrowse={() => { setFilters(DEFAULT_FILTERS); scrollTo('discover'); }} />
        <TrustSection />
        <ImpactSection />
      </main>
      <Footer />
      <ResourceDetails resource={selected} user={user} onClose={() => setSelected(null)} onNeedAuth={needAuth} onToast={notify} onChanged={refreshAll} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={onAuthed} />
      <AccountPanel open={accountOpen} user={user} owned={owned} onClose={() => setAccountOpen(false)} onSignOut={signOut} onToast={notify} />
      <Toast toast={toast} onDone={() => setToast(null)} />
      <Cursor />
    </>
  );
}
