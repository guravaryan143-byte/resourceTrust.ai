import { useState } from 'react';
import { MapPin, ShieldCheck, Clock, Users, Lock } from 'lucide-react';
import * as api from '../api';
import Dialog from './Dialog';
import ResourceVisual from './ResourceVisual';

export const fmtDate = (v) => new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const mins = (m) => (m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`);

function Row({ k, children }) { return <div className="kv"><dt>{k}</dt><dd>{children}</dd></div>; }

function BookingForm({ r, user, onNeedAuth, onToast }) {
  const [f, setF] = useState({ start: '', end: '', purpose: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [elig, setElig] = useState({ note: '', result: '', busy: false });
  const needsElig = /eligibility required/i.test(error);

  const validate = () => {
    const e = {}; const s = new Date(f.start); const en = new Date(f.end);
    if (!f.start) e.start = 'Choose a start time.'; else if (s <= new Date()) e.start = 'Start must be in the future.';
    if (!f.end) e.end = 'Choose an end time.'; else if (f.start && en <= s) e.end = 'End must be after the start.';
    if (f.start && f.end && en > s) {
      const m = Math.round((en - s) / 60000);
      if (m < r.min_booking_minutes || m > r.max_booking_minutes) e.end = `Duration must be between ${mins(r.min_booking_minutes)} and ${mins(r.max_booking_minutes)}.`;
    }
    if (f.purpose.trim().length < 10) e.purpose = 'Describe the purpose in at least 10 characters.';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    if (!user) { onNeedAuth(); return; }
    setError(''); if (!validate()) return;
    setBusy(true);
    try {
      const b = await api.createBooking({ resource_id: r.id, start_at: new Date(f.start).toISOString(), end_at: new Date(f.end).toISOString(), purpose: f.purpose.trim() });
      setBooking(b); onToast('success', b.status === 'waitlisted' ? `Added to the waiting list (position ${b.waitlist_position}).` : 'Request sent to the owner.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const sendElig = async () => {
    setElig((x) => ({ ...x, busy: true, result: '' }));
    try {
      const out = await api.submitEligibility({ requirement: r.required_qualification, evidence_note: elig.note || null });
      setElig((x) => ({ ...x, busy: false, result: out.message }));
    } catch (err) { setElig((x) => ({ ...x, busy: false, result: err.message })); }
  };

  if (booking) {
    return (
      <div className="confirm" role="status">
        <h4>{booking.status === 'waitlisted' ? 'You’re on the waiting list' : 'Request submitted'}</h4>
        <p>Booking #{booking.id} · status <b>{booking.status}</b>{booking.waitlist_position ? ` · position ${booking.waitlist_position}` : ''}.</p>
        <p>{fmtDate(booking.start_at)} → {fmtDate(booking.end_at)}. The owner must approve before the resource is yours; track it under “My account”.</p>
      </div>
    );
  }
  if (r.status !== 'active') return <p className="notice">This resource is <b>{r.status}</b> and isn’t accepting requests right now.</p>;

  return (
    <form onSubmit={submit} noValidate className="form-stack">
      <h4>Request access</h4>
      {!user && <p className="notice"><Lock size={14} /> Sign in to send a request.</p>}
      <div className="two">
        <label className={`lbl ${errors.start ? 'bad' : ''}`}>Start<input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} aria-invalid={!!errors.start} />{errors.start && <small>{errors.start}</small>}</label>
        <label className={`lbl ${errors.end ? 'bad' : ''}`}>End<input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} aria-invalid={!!errors.end} />{errors.end && <small>{errors.end}</small>}</label>
      </div>
      <label className={`lbl ${errors.purpose ? 'bad' : ''}`}>Purpose<textarea rows={3} maxLength={500} placeholder="What will you use it for?" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} aria-invalid={!!errors.purpose} />{errors.purpose && <small>{errors.purpose}</small>}</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {needsElig && (
        <div className="elig">
          <p>This resource needs verified <b>{r.required_qualification}</b>. You can submit evidence for a manager or admin to review; you can book after it is verified.</p>
          <label className="lbl">Evidence note (optional)<input value={elig.note} maxLength={500} onChange={(e) => setElig({ ...elig, note: e.target.value })} /></label>
          <button type="button" className="btn ghost sm" onClick={sendElig} disabled={elig.busy}>{elig.busy ? 'Submitting…' : 'Submit eligibility for review'}</button>
          {elig.result && <p role="status">{elig.result}</p>}
        </div>
      )}
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending…' : user ? 'Send request' : 'Sign in to request'}</button>
    </form>
  );
}

function OwnerControls({ r, onToast, onChanged }) {
  const [busy, setBusy] = useState(false);
  const change = async (status) => {
    setBusy(true);
    try { await api.setResourceStatus(r.id, status); onToast('success', `Status set to ${status}.`); onChanged(); }
    catch (err) { onToast('error', err.message); } finally { setBusy(false); }
  };
  return (
    <div className="owner-box"><h4>Manage this listing</h4>
      <label className="select"><span>Status</span>
        <select value={r.status} disabled={busy} onChange={(e) => change(e.target.value)}>
          {['active', 'paused', 'maintenance', 'archived'].map((s) => <option key={s}>{s}</option>)}</select></label>
    </div>
  );
}

export default function ResourceDetails({ resource: r, user, onClose, onNeedAuth, onToast, onChanged }) {
  const canManage = user && (user.id === r?.owner_id || ['admin', 'manager'].includes(user.role));
  return (
    <Dialog open={!!r} onClose={onClose} label={r ? `Details for ${r.name}` : 'Resource details'} variant="drawer">
      {r && (
        <div className="details">
          <ResourceVisual id={r.id} category={r.category} />
          <div className="det-body">
            <div className="card-top"><span className="tag">{r.category}</span><span className={`status ${r.status}`}><i />{r.status}</span></div>
            <h3>{r.name}</h3>
            <p className="meta"><MapPin size={14} />{r.location}{r.institution ? ` · ${r.institution}` : ''}</p>
            <p className="desc">{r.description}</p>
            <dl className="kvs">
              <Row k="Capacity"><Users size={14} /> {r.capacity}</Row>
              <Row k="Booking length"><Clock size={14} /> {mins(r.min_booking_minutes)} – {mins(r.max_booking_minutes)}</Row>
              <Row k="Deposit">{Number(r.deposit_amount) > 0 ? Number(r.deposit_amount).toLocaleString() : 'None'} <small className="faint">(recorded only; no payment is taken)</small></Row>
              <Row k="Training">{r.requires_training ? <><ShieldCheck size={14} /> {r.required_qualification} (verified before booking)</> : 'Not required'}</Row>
              <Row k="Supervision">{r.supervision_required ? 'Required' : 'Not required'}</Row>
              <Row k="Provider">Member #{r.owner_id} <small className="faint">(the API doesn’t expose owner name or contact details)</small></Row>
              <Row k="Listed">{fmtDate(r.created_at)}</Row>
            </dl>
            {r.usage_rules && <><h4>Usage rules</h4><p className="desc">{r.usage_rules}</p></>}
            {canManage && <OwnerControls r={r} onToast={onToast} onChanged={() => { onChanged(); onClose(); }} />}
            <BookingForm r={r} user={user} onNeedAuth={onNeedAuth} onToast={onToast} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
