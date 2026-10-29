import { useState } from 'react';
import * as api from '../api';
import Dialog from './Dialog';

export default function AuthDialog({ open, onClose, onAuthed, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [f, setF] = useState({ full_name: '', email: '', password: '', institution: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const e = {};
    if (mode === 'register' && f.full_name.trim().length < 2) e.full_name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.';
    if (f.password.length < (mode === 'register' ? 10 : 1)) e.password = mode === 'register' ? 'Use at least 10 characters.' : 'Enter your password.';
    setErrors(e); return !Object.keys(e).length;
  };
  const submit = async (ev) => {
    ev.preventDefault(); if (busy || !validate()) return;
    setBusy(true); setError('');
    try {
      if (mode === 'register') await api.register({ email: f.email, full_name: f.full_name.trim(), password: f.password, institution: f.institution.trim() || null });
      await api.login(f.email, f.password);
      await onAuthed(mode === 'register');
      setF({ full_name: '', email: '', password: '', institution: '' });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} label={mode === 'login' ? 'Sign in' : 'Create account'}>
      <form className="auth form-stack" onSubmit={submit} noValidate>
        <h3>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h3>
        <p className="faint">{mode === 'login' ? 'Sign in to request resources and manage listings.' : 'New accounts start as regular members. An admin grants the owner role needed to list resources.'}</p>
        {mode === 'register' && <>
          <label className={`lbl ${errors.full_name ? 'bad' : ''}`}>Full name<input data-autofocus autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />{errors.full_name && <small>{errors.full_name}</small>}</label>
          <label className="lbl">Institution (optional)<input autoComplete="organization" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} /></label></>}
        <label className={`lbl ${errors.email ? 'bad' : ''}`}>Email<input type="email" autoComplete="email" data-autofocus={mode === 'login' ? true : undefined} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />{errors.email && <small>{errors.email}</small>}</label>
        <label className={`lbl ${errors.password ? 'bad' : ''}`}>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{errors.password && <small>{errors.password}</small>}</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setErrors({}); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</button>
      </form>
    </Dialog>
  );
}
