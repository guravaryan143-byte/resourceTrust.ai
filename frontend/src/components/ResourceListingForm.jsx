import { useState } from 'react';
import * as api from '../api';

const EMPTY = { name: '', description: '', category: '', location: '', institution: '', capacity: 1, requires_training: false, required_qualification: '', supervision_required: false, deposit_amount: 0, usage_rules: '', min_booking_minutes: 30, max_booking_minutes: 480 };
const SUGGESTIONS = ['Tools & Equipment', 'Workspaces', 'Electronics', 'Machinery', 'Creative Studios', 'Event Spaces', 'Laboratory', 'Other'];
const CAN_LIST = ['owner', 'manager', 'admin'];

export default function ResourceListingForm({ user, onNeedAuth, onCreated, onToast, onBrowse }) {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const allowed = user && CAN_LIST.includes(user.role);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const validate = () => {
    const e = {}; const mn = Number(f.min_booking_minutes); const mx = Number(f.max_booking_minutes);
    if (f.name.trim().length < 2) e.name = 'Name needs at least 2 characters.';
    if (f.description.trim().length < 10) e.description = 'Describe it in at least 10 characters.';
    if (f.category.trim().length < 2) e.category = 'Choose or type a category.';
    if (f.location.trim().length < 2) e.location = 'Add a location or address.';
    if (!(Number(f.capacity) >= 1 && Number(f.capacity) <= 1000)) e.capacity = 'Capacity must be 1–1000.';
    if (!(Number(f.deposit_amount) >= 0)) e.deposit_amount = 'Deposit can’t be negative.';
    if (!(mn >= 15 && mn <= 1440)) e.min_booking_minutes = 'Between 15 and 1440 minutes.';
    if (!(mx >= 15 && mx <= 10080)) e.max_booking_minutes = 'Between 15 and 10080 minutes.';
    else if (mx < mn) e.max_booking_minutes = 'Must be at least the minimum.';
    if (f.requires_training && !f.required_qualification.trim()) e.required_qualification = 'Name the qualification required.';
    setErrors(e); return !Object.keys(e).length;
  };

  const submit = async (ev) => {
    ev.preventDefault(); if (busy) return;
    if (!user) { onNeedAuth(); return; }
    setError(''); if (!validate()) return;
    setBusy(true);
    try {
      const out = await api.createResource({
        name: f.name.trim(), description: f.description.trim(), category: f.category.trim(), location: f.location.trim(),
        institution: f.institution.trim() || null, capacity: Number(f.capacity), requires_training: f.requires_training,
        required_qualification: f.requires_training ? f.required_qualification.trim() : null, supervision_required: f.supervision_required,
        deposit_amount: Number(f.deposit_amount), usage_rules: f.usage_rules.trim(),
        min_booking_minutes: Number(f.min_booking_minutes), max_booking_minutes: Number(f.max_booking_minutes),
      });
      setCreated(out); onCreated(); onToast('success', `“${out.name}” is now listed.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const field = (k, label, props = {}) => (
    <label className={`lbl ${errors[k] ? 'bad' : ''}`}>{label}
      <input value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} {...props} />{errors[k] && <small>{errors[k]}</small>}</label>
  );

  return (
    <section id="list" className="section alt" aria-labelledby="list-title">
      <div className="wrap list-grid">
        <div className="list-copy">
          <p className="eyebrow" data-reveal>04 — List a resource</p>
          <h2 id="list-title" data-reveal>Put your idle resources <em>to work.</em></h2>
          <p className="lede" data-reveal>List what you own. Help someone get what they need. Make better use of the resources already around us.</p>
          <ul className="plain" data-reveal>
            <li>Listings are saved to the platform database through the API.</li>
            <li>You approve, reject or waitlist every request.</li>
            <li>Listing requires the <b>owner</b>, <b>manager</b> or <b>admin</b> role; an admin grants it after sign-up.</li>
          </ul>
        </div>

        {created ? (
          <div className="panel confirm" role="status">
            <h3>Listed successfully</h3>
            <p><b>{created.name}</b> was saved as resource #{created.id} with status <b>{created.status}</b>.</p>
            <div className="cta-row"><button type="button" className="btn primary" onClick={onBrowse}>See it in discovery</button>
              <button type="button" className="btn ghost" onClick={() => { setCreated(null); setF(EMPTY); }}>List another</button></div>
          </div>
        ) : (
          <form className="panel form-stack" onSubmit={submit} noValidate>
            {!user && <p className="notice">Sign in to list a resource. <button type="button" className="link-btn inline" onClick={onNeedAuth}>Sign in</button></p>}
            {user && !allowed && <p className="notice" role="note">Your account role is <b>{user.role}</b>. Only owners, managers and admins can create listings; ask an administrator to promote your account.</p>}
            {field('name', 'Resource name', { placeholder: 'e.g. Bosch table saw', maxLength: 180 })}
            <label className={`lbl ${errors.description ? 'bad' : ''}`}>Description<textarea rows={3} placeholder="Condition, what it’s good for, what’s included" value={f.description} onChange={set('description')} aria-invalid={!!errors.description} />{errors.description && <small>{errors.description}</small>}</label>
            <div className="two">
              <label className={`lbl ${errors.category ? 'bad' : ''}`}>Category<input list="cats" placeholder="Pick or type" value={f.category} onChange={set('category')} maxLength={60} />
                <datalist id="cats">{SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>{errors.category && <small>{errors.category}</small>}</label>
              {field('location', 'Location / address', { placeholder: 'Building, street, city', maxLength: 255 })}
            </div>
            <div className="two">
              {field('institution', 'Institution (optional)', { maxLength: 180 })}
              {field('capacity', 'Capacity', { type: 'number', min: 1, max: 1000 })}
            </div>
            <div className="three">
              {field('min_booking_minutes', 'Min booking (min)', { type: 'number', min: 15 })}
              {field('max_booking_minutes', 'Max booking (min)', { type: 'number', min: 15 })}
              {field('deposit_amount', 'Deposit', { type: 'number', min: 0, step: '0.01' })}
            </div>
            <label className="check"><input type="checkbox" checked={f.requires_training} onChange={set('requires_training')} /> Requires verified training</label>
            {f.requires_training && field('required_qualification', 'Required qualification', { placeholder: 'e.g. Workshop safety induction' })}
            <label className="check"><input type="checkbox" checked={f.supervision_required} onChange={set('supervision_required')} /> Supervision required</label>
            <label className="lbl">Usage rules (optional)<textarea rows={2} value={f.usage_rules} onChange={set('usage_rules')} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy || (user && !allowed)}>{busy ? 'Saving…' : user ? 'Publish listing' : 'Sign in to list'}</button>
          </form>
        )}
      </div>
    </section>
  );
}
