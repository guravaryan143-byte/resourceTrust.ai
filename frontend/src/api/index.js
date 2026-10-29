// Typed-by-convention wrappers over the endpoints that exist in app/main.py. Nothing here is simulated.
import { API_BASE, request, tokenStore, ApiError } from './client';

const qs = (params) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') s.set(k, String(v)); });
  const out = s.toString();
  return out ? `?${out}` : '';
};

// GET /health returns 200 {database:'connected'} or 503 {database:'unavailable'}.
export async function getHealth(signal) {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-store', signal });
    const data = await res.json().catch(() => ({}));
    return { reachable: true, database: data?.database === 'connected' ? 'connected' : 'unavailable' };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { reachable: false, database: 'unknown' };
  }
}

// Auth
export const register = (p) => request('/api/v1/auth/register', { method: 'POST', body: p, auth: false });
export async function login(email, password) {
  const data = await request('/api/v1/auth/login', { method: 'POST', body: { email, password }, auth: false });
  tokenStore.set(data.access_token);
  return data;
}
export const getMe = (signal) => request('/api/v1/auth/me', { signal });

// Resources. Supported server filters: q, category (case-insensitive exact), location (contains),
// institution (contains), requires_training, status_filter, limit (<=100), offset.
export const listResources = (params, signal) => request(`/api/v1/resources${qs(params)}`, { signal });
export const getResource = (id, signal) => request(`/api/v1/resources/${id}`, { signal });
export const createResource = (payload) => request('/api/v1/resources', { method: 'POST', body: payload });
export const setResourceStatus = (id, status) => request(`/api/v1/resources/${id}/status`, { method: 'PATCH', body: { status } });

// Bookings
export const createBooking = (payload) => request('/api/v1/bookings', { method: 'POST', body: payload });
export const myBookings = (signal) => request('/api/v1/bookings/me', { signal });
export const resourceBookings = (id, signal) => request(`/api/v1/resources/${id}/bookings`, { signal });
export const decideBooking = (id, decision, note) => request(`/api/v1/bookings/${id}/decision`, { method: 'PATCH', body: { decision, note: note || null } });
export const cancelBooking = (id) => request(`/api/v1/bookings/${id}/cancel`, { method: 'POST' });

// Eligibility
export const submitEligibility = (payload) => request('/api/v1/eligibility', { method: 'POST', body: payload });
export const myEligibility = (signal) => request('/api/v1/eligibility/me', { signal });

// Notifications
export const listNotifications = (signal) => request('/api/v1/notifications', { signal });
export const markNotificationRead = (id) => request(`/api/v1/notifications/${id}/read`, { method: 'POST' });

export { API_BASE, ApiError, tokenStore };
