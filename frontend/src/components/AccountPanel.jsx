import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import Dialog from './Dialog';
import { fmtDate } from './ResourceDetails';

const CANCELLABLE = ['pending', 'waitlisted', 'approved'];

function Inbox({ owned, onToast }) {
  const [rows, setRows] = useState({ status: 'loading', items: [], error: '' });
  const [busyId, setBusyId] = useState(null);
  const load = useCallback(async () => {
    try {
      const lists = await Promise.all(owned.slice(0, 20).map(async (r) => (await api.resourceBookings(r.id)).map((b) => ({ ...b, resource: r }))));
      setRows({ status: 'ok', items: lists.flat().filter((b) => b.status === 'pending'), error: '' });
    } catch (e) { setRows({ status: 'error', items: [], error: e.message }); }
  }, [owned]);
  useEffect(() => { load(); }, [load]);

  const decide = async (b, decision) => {
    setBusyId(b.id);
    try { await api.decideBooking(b.id, decision); onToast('success', `Request #${b.id}: ${decision} recorded.`); await load(); }
    catch (e) { onToast('error', e.message); } finally { setBusyId(null); }
  };
  if (!owned.length) return <p className="faint">You don’t have any active listings in the loaded catalogue.</p>;
  if (rows.status === 'loading') return <p className="faint">Loading requests…</p>;
  if (rows.status === 'error') return <p className="form-error" role="alert">{rows.error} <button type="button" className="link-btn inline" onClick={load}>Retry</button></p>;
  if (!rows.items.length) return <p className="faint">No pending requests.</p>;
  return rows.items.map((b) => (
    <div className="row-card" key={b.id}>
      <b>{b.resource.name}</b><small>{fmtDate(b.start_at)} → {fmtDate(b.end_at)}</small><p>{b.purpose}</p>
      <div className="cta-row">
        {['approve', 'reject', 'waitlist'].map((d) => <button key={d} type="button" className="btn ghost sm" disabled={busyId === b.id} onClick={() => decide(b, d)}>{d[0].toUpperCase() + d.slice(1)}</button>)}
      </div>
    </div>
  ));
}

export default function AccountPanel({ open, user, owned, onClose, onSignOut, onToast }) {
  const [data, setData] = useState({ status: 'loading', bookings: [], notes: [], elig: [], error: '' });
  const load = useCallback(async () => {
    try {
      const [bookings, notes, elig] = await Promise.all([api.myBookings(), api.listNotifications(), api.myEligibility()]);
      setData({ status: 'ok', bookings, notes, elig, error: '' });
    } catch (e) { setData((d) => ({ ...d, status: 'error', error: e.message })); }
  }, []);
  useEffect(() => { if (open) { setData((d) => ({ ...d, status: 'loading' })); load(); } }, [open, load]);

  const cancel = async (b) => {
    try { await api.cancelBooking(b.id); onToast('success', `Booking #${b.id} cancelled.`); load(); } catch (e) { onToast('error', e.message); }
  };
  const read = async (n) => { try { await api.markNotificationRead(n.id); load(); } catch (e) { onToast('error', e.message); } };
  const canOwn = user && ['owner', 'manager', 'admin'].includes(user.role);

  return (
    <Dialog open={open} onClose={onClose} label="My account" variant="drawer">
      {user && (
        <div className="account">
          <h3>{user.full_name}</h3>
          <p className="faint">{user.email} · role <b>{user.role}</b>{user.institution ? ` · ${user.institution}` : ''}</p>
          {data.status === 'error' && <p className="form-error" role="alert">{data.error} <button type="button" className="link-btn inline" onClick={load}>Retry</button></p>}

          {canOwn && <><h4>Incoming requests</h4><Inbox owned={owned} onToast={onToast} /></>}

          <h4>My bookings</h4>
          {data.status === 'loading' ? <p className="faint">Loading…</p> : data.bookings.length === 0 ? <p className="faint">No bookings yet.</p> : data.bookings.map((b) => (
            <div className="row-card" key={b.id}>
              <b>Booking #{b.id} · {b.status}{b.waitlist_position ? ` (waitlist ${b.waitlist_position})` : ''}</b>
              <small>Resource #{b.resource_id} · {fmtDate(b.start_at)} → {fmtDate(b.end_at)}</small>
              {b.decision_note && <p>Owner note: {b.decision_note}</p>}
              {CANCELLABLE.includes(b.status) && <button type="button" className="btn ghost sm" onClick={() => cancel(b)}>Cancel request</button>}
            </div>
          ))}

          <h4>Eligibility</h4>
          {data.elig.length === 0 ? <p className="faint">No eligibility records.</p> : data.elig.map((e) => <p key={e.id} className="faint">{e.requirement}: <b>{e.verified ? 'verified' : 'pending review'}</b></p>)}

          <h4>Notifications</h4>
          {data.notes.length === 0 ? <p className="faint">Nothing yet.</p> : data.notes.slice(0, 10).map((n) => (
            <div className={`row-card ${n.read_at ? 'read' : ''}`} key={n.id}><b>{n.title}</b><p>{n.message}</p>
              {!n.read_at && <button type="button" className="btn ghost sm" onClick={() => read(n)}>Mark read</button>}</div>
          ))}
          <button type="button" className="btn ghost" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </Dialog>
  );
}
