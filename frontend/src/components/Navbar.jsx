import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const LINKS = [['discover', 'Discover'], ['how', 'How it works'], ['impact', 'Impact'], ['list', 'List a resource']];

export default function Navbar({ active, user, onSignIn, onAccount }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const go = () => setOpen(false);
  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="wrap nav-in">
        <a href="#home" className="wordmark" aria-label="resourceTrust.ai home">resource<b>Trust</b><i>.ai</i></a>
        <nav aria-label="Primary" className="nav-links">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined} className={active === id ? 'on' : ''}>{label}</a>
          ))}
        </nav>
        <div className="nav-cta">
          {user
            ? <button type="button" className="btn ghost sm" onClick={onAccount}>{user.full_name.split(' ')[0]} · {user.role}</button>
            : <button type="button" className="btn primary sm" onClick={onSignIn}>Sign in / Get started</button>}
          <button type="button" className="icon-btn menu-btn" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile">
          {LINKS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go}>{label}</a>)}
          {user
            ? <button type="button" className="btn ghost" onClick={() => { go(); onAccount(); }}>My account</button>
            : <button type="button" className="btn primary" onClick={() => { go(); onSignIn(); }}>Sign in / Get started</button>}
        </nav>
      )}
    </header>
  );
}
