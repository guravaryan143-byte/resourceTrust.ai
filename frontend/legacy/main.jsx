import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

async function request(path, options = {}) {
  const token = localStorage.getItem('rt_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!res.ok) {
    throw new Error(data?.detail || data?.message || `Request failed (${res.status})`);
  }

  return data;
}

function App() {
  const [apiState, setApiState] = useState('checking');
  const [user, setUser] = useState(null);
  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [authForm, setAuthForm] = useState({ full_name: '', email: '', password: '', institution: '' });
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [resourceForm, setResourceForm] = useState({
    name: '', description: '', category: 'Laboratory', location: '', institution: '',
    capacity: 1, requires_training: false, required_qualification: '', supervision_required: false,
    deposit_amount: 0, usage_rules: '', min_booking_minutes: 30, max_booking_minutes: 480,
  });
  const [bookingForm, setBookingForm] = useState({ start_at: '', end_at: '', purpose: '' });

  const availableResources = useMemo(() => resources.filter((resource) => resource.status !== 'archived'), [resources]);

  const apiStatusText = apiState === 'connected' ? 'API ONLINE' : apiState === 'database unavailable' ? 'DB DEGRADED' : 'API OFFLINE';

  async function refreshData() {
    try {
      const healthResponse = await fetch(`${API}/health`, { cache: 'no-store' });
      if (!healthResponse.ok) {
        let nextStatus = 'backend unavailable';
        try {
          const healthData = await healthResponse.json();
          nextStatus = healthData?.database === 'unavailable' ? 'database unavailable' : nextStatus;
        } catch {
          nextStatus = 'backend unavailable';
        }
        setApiState(nextStatus);
      } else {
        const healthData = await healthResponse.json().catch(() => ({}));
        setApiState(healthData?.database === 'connected' ? 'connected' : 'database unavailable');
      }
    } catch {
      setApiState('backend unavailable');
    }

    try {
      const resourceData = await request('/api/v1/resources?limit=100');
      setResources(Array.isArray(resourceData) ? resourceData : []);
    } catch {
      setResources([]);
    }

    const token = localStorage.getItem('rt_token');
    if (!token) {
      setUser(null);
      setBookings([]);
      setNotifications([]);
      return;
    }

    try {
      const [me, bookingsData, notificationData] = await Promise.all([
        request('/api/v1/auth/me'),
        request('/api/v1/bookings/me').catch(() => []),
        request('/api/v1/notifications').catch(() => [])
      ]);
      setUser(me);
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setNotifications(Array.isArray(notificationData) ? notificationData : []);
    } catch {
      localStorage.removeItem('rt_token');
      setUser(null);
      setBookings([]);
      setNotifications([]);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      if (authMode === 'register') {
        await request('/api/v1/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: authForm.email,
            full_name: authForm.full_name,
            password: authForm.password,
            institution: authForm.institution || 'ResourceTrust Demo'
          })
        });
        setAuthMode('login');
        setStatus('Account created. Please sign in.');
      } else {
        const data = await request('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: authForm.email, password: authForm.password })
        });
        localStorage.setItem('rt_token', data.access_token);
        await refreshData();
        setStatus('Signed in successfully.');
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResourceSubmit(event) {
    event.preventDefault();
    if (!user) {
      setStatus('Sign in to create a resource.');
      return;
    }

    setLoading(true);
    setStatus('');

    try {
      await request('/api/v1/resources', {
        method: 'POST',
        body: JSON.stringify({
          ...resourceForm,
          capacity: Number(resourceForm.capacity),
          deposit_amount: Number(resourceForm.deposit_amount),
          min_booking_minutes: Number(resourceForm.min_booking_minutes),
          max_booking_minutes: Number(resourceForm.max_booking_minutes)
        })
      });
      setResourceForm({
        name: '', description: '', category: 'Laboratory', location: '', institution: '',
        capacity: 1, requires_training: false, required_qualification: '', supervision_required: false,
        deposit_amount: 0, usage_rules: '', min_booking_minutes: 30, max_booking_minutes: 480,
      });
      await refreshData();
      setStatus('Resource published.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBookingSubmit(event) {
    event.preventDefault();
    if (!user) {
      setStatus('Please sign in to request a booking.');
      return;
    }

    if (!selectedResourceId) {
      setStatus('Select a resource first.');
      return;
    }

    setLoading(true);
    setStatus('');

    try {
      await request('/api/v1/bookings', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: selectedResourceId,
          start_at: new Date(bookingForm.start_at).toISOString(),
          end_at: new Date(bookingForm.end_at).toISOString(),
          purpose: bookingForm.purpose || 'Resource access request'
        })
      });
      setBookingForm({ start_at: '', end_at: '', purpose: '' });
      setSelectedResourceId(null);
      await refreshData();
      setStatus('Booking request submitted.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('rt_token');
    setUser(null);
    setBookings([]);
    setNotifications([]);
    setStatus('Signed out.');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div>
            <strong>resource<span>trust</span></strong>
            <small>ACCESS, WITH ACCOUNTABILITY.</small>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE <span>01</span></div>

        <nav className="nav-list" aria-label="Main navigation">
          <button type="button" className="nav-item active"><span>Overview</span><span className="nav-arrow">›</span></button>
          <button type="button" className="nav-item"><span>Resources</span><span className="nav-dot" /></button>
          <button type="button" className="nav-item"><span>Bookings</span><span className="nav-arrow">›</span></button>
          <button type="button" className="nav-item"><span>Reports</span><span className="nav-arrow">›</span></button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="side-card">
          <div className="side-card-icon">✓</div>
          <p>Trusted sharing for pilot labs, workshops, equipment, and community infrastructure.</p>
          <span>RESOURCE READY</span>
        </div>

        <div className="profile-row">
          {user ? (
            <>
              <div className="avatar">{(user.full_name || 'User').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div className="profile-copy">
                <b>{user.full_name}</b>
                <span>{user.role} · {user.institution || 'Community member'}</span>
              </div>
              <button type="button" className="icon-button" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <div className="avatar avatar-guest">?</div>
              <div className="profile-copy">
                <b>Guest explorer</b>
                <span>Sign in to make a request</span>
              </div>
            </>
          )}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Resource access <span>/</span> <b>Portfolio</b></div>
          <div className="top-actions">
            <div className={`api-indicator ${apiState === 'connected' ? 'connected' : 'offline'}`}>
              <i />
              {apiStatusText}
            </div>
            {user ? <button type="button" className="top-cta">New request</button> : <button type="button" className="top-cta">Join network</button>}
          </div>
        </header>

        <section className="hero">
          <div className="hero-content">
            <div className="eyebrow"><span className="eyebrow-line" /> Resource access <span className="eyebrow-index">01</span></div>
            <h1>Access more.<br />Waste less.<em> Better.</em></h1>
            <p className="hero-desc">Manage institutional resources with transparent access, smarter scheduling, and accountability built into every booking.</p>
            <div className="hero-buttons">
              <button type="button" className="button-primary">Reserve a resource</button>
              <button type="button" className="button-text">Explore the catalogue</button>
            </div>
            <div className="hero-foot">
              <div className="avatar-stack">
                <span>AL</span>
                <span>RM</span>
                <span>ST</span>
                <span>+4</span>
              </div>
              <p><b>32 partner institutions</b><br />Across labs, studios, fleets, and shared facilities.</p>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image" />
            <div className="hero-image-overlay" />
            <div className="hero-image-label">
              <span>Operational snapshot</span>
              <b>7.2k requests processed with full access traceability.</b>
              <div className="label-bottom"><span>Live schedule</span><span>✓ Verified</span></div>
            </div>
            <div className="hero-vertical">Sharing built for trust</div>
            <div className="hero-stamp"><span>•</span><small>Realtime<br />tracking</small></div>
            <div className="hero-index"><span>01</span> / 04</div>
          </div>
        </section>

        <section className="metrics-strip">
          <div>
            <div className="metric-number">962<span>%</span></div>
            <p><b>Utilisation</b><small>Resource efficiency</small></p>
          </div>
          <div>
            <div className="metric-number">1.8k</div>
            <p><b>Approvals</b><small>Monthly demand</small></p>
          </div>
          <div>
            <div className="metric-number">48h</div>
            <p><b>Cycle time</b><small>Decision window</small></p>
          </div>
          <div className="metrics-aside">
            <span className="tiny-kicker">Network</span>
            <b>Accountability by design</b>
          </div>
        </section>

        {status && <div className="status-banner">{status}</div>}

        <section className="catalog-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> Shared inventory</div>
              <h2>Access-ready <em>resources</em></h2>
            </div>
            <div className="section-counter"><b>24</b><span>active listings</span></div>
          </div>

          <div className="panel-grid">
            <div className="panel auth-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Access</span>
                  <h2>{user ? 'Signed in' : authMode === 'login' ? 'Sign in' : 'Register'}</h2>
                </div>
                <button type="button" className="chip-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                  {authMode === 'login' ? 'Create account' : 'Back to sign in'}
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="stacked-form">
                {authMode === 'register' && (
                  <label className="field">
                    <span>Full name</span>
                    <input value={authForm.full_name} onChange={(event) => setAuthForm({ ...authForm, full_name: event.target.value })} />
                  </label>
                )}
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
                </label>
                {authMode === 'register' && (
                  <label className="field">
                    <span>Institution</span>
                    <input value={authForm.institution} onChange={(event) => setAuthForm({ ...authForm, institution: event.target.value })} />
                  </label>
                )}
                <button type="submit" className="button-primary full-width" disabled={loading}>
                  {loading ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}
                </button>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Publish</span>
                  <h2>Create resource</h2>
                </div>
              </div>

              <form onSubmit={handleResourceSubmit} className="stacked-form">
                <label className="field">
                  <span>Resource name</span>
                  <input value={resourceForm.name} onChange={(event) => setResourceForm({ ...resourceForm, name: event.target.value })} />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea rows="3" value={resourceForm.description} onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })} />
                </label>
                <div className="inline-two">
                  <label className="field">
                    <span>Category</span>
                    <input value={resourceForm.category} onChange={(event) => setResourceForm({ ...resourceForm, category: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input value={resourceForm.location} onChange={(event) => setResourceForm({ ...resourceForm, location: event.target.value })} />
                  </label>
                </div>
                <div className="inline-two">
                  <label className="field">
                    <span>Capacity</span>
                    <input type="number" min="1" value={resourceForm.capacity} onChange={(event) => setResourceForm({ ...resourceForm, capacity: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Deposit</span>
                    <input type="number" min="0" value={resourceForm.deposit_amount} onChange={(event) => setResourceForm({ ...resourceForm, deposit_amount: event.target.value })} />
                  </label>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={resourceForm.requires_training} onChange={(event) => setResourceForm({ ...resourceForm, requires_training: event.target.checked })} />
                  Requires training
                </label>
                {resourceForm.requires_training && (
                  <label className="field">
                    <span>Required qualification</span>
                    <input value={resourceForm.required_qualification} onChange={(event) => setResourceForm({ ...resourceForm, required_qualification: event.target.value })} />
                  </label>
                )}
                <button type="submit" className="button-primary full-width" disabled={loading || !user}>Publish resource</button>
              </form>
            </div>
          </div>

          <div className="catalog-controls">
            <div className="searchbox">
              <span>⌕</span>
              <input aria-label="Search resources" type="text" placeholder="Search resources, labs, facilities" />
              <kbd>/</kbd>
            </div>
            <button type="button" className="filter-button">Filters</button>
            <div className="sort-control">
              <span>Sort</span>
              <select defaultValue="recommended">
                <option value="recommended">Recommended</option>
                <option value="recent">Most recent</option>
                <option value="capacity">Capacity</option>
              </select>
            </div>
          </div>

          <div className="resource-grid">
            {availableResources.map((resource, index) => (
              <article key={resource.id} className="resource-card" style={{ '--delay': `${index * 80}ms` }}>
                <button type="button" className="card-image-button" onClick={() => setSelectedResourceId(resource.id)}>
                  <div className="card-image" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80')` }} />
                  <span className="card-index">#{String(resource.id).padStart(3, '0')}</span>
                  <span className="card-status status-warm"><i />{resource.status || 'Active'}</span>
                  <span className="card-open">↗</span>
                </button>
                <div className="card-body">
                  <div className="card-overline">
                    <span>{resource.category}</span>
                    <button type="button" className="save-button" aria-label="Save resource">☆</button>
                  </div>
                  <button type="button" className="card-title" onClick={() => setSelectedResourceId(resource.id)}>{resource.name}</button>
                  <div className="card-location">📍 {resource.location || 'Campus hub'}</div>
                  <p className="card-description">{resource.description || 'Shared access managed through the ResourceTrust approval workflow.'}</p>
                  <div className="card-meta">
                    <span>🏠 {resource.institution || 'Shared network'}</span>
                    <span>👥 {resource.capacity || 1} seats</span>
                  </div>
                  <div className="card-footer">
                    <div className="institution-mark">R</div>
                    <div className="institution-name">
                      <b>{resource.owner_name || 'ResourceTrust'}</b>
                      <small>Verified access</small>
                    </div>
                    <button type="button" className="card-request" onClick={() => setSelectedResourceId(resource.id)}>→</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="catalog-section">
          <div className="panel-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Booking</span>
                  <h2>Request booking</h2>
                </div>
              </div>
              <form onSubmit={handleBookingSubmit} className="stacked-form">
                <label className="field">
                  <span>Selected resource</span>
                  <input value={selectedResourceId ? availableResources.find((resource) => resource.id === selectedResourceId)?.name || '' : ''} readOnly />
                </label>
                <div className="inline-two">
                  <label className="field">
                    <span>Start</span>
                    <input type="datetime-local" value={bookingForm.start_at} onChange={(event) => setBookingForm({ ...bookingForm, start_at: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>End</span>
                    <input type="datetime-local" value={bookingForm.end_at} onChange={(event) => setBookingForm({ ...bookingForm, end_at: event.target.value })} />
                  </label>
                </div>
                <label className="field">
                  <span>Purpose</span>
                  <textarea rows="3" value={bookingForm.purpose} onChange={(event) => setBookingForm({ ...bookingForm, purpose: event.target.value })} />
                </label>
                <button type="submit" className="button-primary full-width" disabled={loading || !user || !selectedResourceId}>Submit booking request</button>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Overview</span>
                  <h2>My bookings</h2>
                </div>
              </div>

              {bookings.length === 0 ? (
                <div className="empty-state">No bookings yet. Create a resource or request one to see activity here.</div>
              ) : (
                <ul className="list-stack">
                  {bookings.map((booking) => (
                    <li key={booking.id} className="booking-item">
                      <strong>#{booking.id}</strong>
                      <span>{booking.status}</span>
                      <small>{booking.purpose || 'Resource use'}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {notifications.length > 0 && (
          <section className="catalog-section compact-section">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Alerts</span>
                  <h2>Notifications</h2>
                </div>
              </div>
              <ul className="list-stack">
                {notifications.map((notification) => (
                  <li key={notification.id} className="notification-item">
                    <strong>{notification.title}</strong>
                    <small>{notification.message}</small>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);