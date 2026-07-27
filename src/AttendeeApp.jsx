import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const sessionKey = 'tinkerBingoAttendee';
const getClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('This event is not configured yet. Ask the host to add the public Supabase environment variables.');
  return createClient(url, key, { auth: { persistSession: false } });
};
const saveSession = (session) => localStorage.setItem(sessionKey, JSON.stringify(session));
const loadSession = () => { try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; } };

function JoinPage() {
  const eventId = useMemo(() => new URLSearchParams(location.search).get('event'), []);
  const [form, setForm] = useState({ name: '', branch: '', semester: '', email: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [registered, setRegistered] = useState(null);
  const update = (field) => (e) => setForm(current => ({ ...current, [field]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); if (!eventId) return setError('This QR code does not include an event ID. Ask the host to generate a new one.');
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await getClient().rpc('register_attendee', { p_event_id: eventId, p_name: form.name, p_branch: form.branch, p_semester: form.semester, p_email: form.email });
      if (rpcError) throw rpcError;
      const attendee = Array.isArray(data) ? data[0] : data;
      if (!attendee) throw new Error('Registration did not return an attendee record.');
      saveSession({ attendeeId: attendee.attendee_id, eventId: attendee.event_id, secretCode: attendee.secret_code, name: attendee.attendee_name }); setRegistered(attendee);
    } catch (err) { setError(err.message || 'Could not register. Please try again.'); } finally { setBusy(false); }
  }
  if (registered) return <main className="attendee-shell"><section className="attendee-card success-card"><span className="eyebrow">YOU’RE CHECKED IN</span><h1>Welcome, {registered.attendee_name}!</h1><p>{registered.recovered ? 'Your previous check-in was recovered.' : 'You are registered for the hunt.'}</p><div className="secret-code"><span>Your code</span><strong>{registered.secret_code}</strong></div><p className="code-help">Remember this code. Other players will ask for it to confirm they found you.</p><button onClick={() => location.assign('/waiting')}>Continue to waiting room</button></section></main>;
  return <main className="attendee-shell"><section className="attendee-card"><span className="eyebrow">TINKERBINGO</span><h1>Join the hunt</h1><p>Enter your details to receive your personal player code.</p><form onSubmit={submit}><label>Name<input required value={form.name} onChange={update('name')} placeholder="Your full name" /></label><label>Branch<input required value={form.branch} onChange={update('branch')} placeholder="e.g. Computer Science" /></label><label>Semester<input required value={form.semester} onChange={update('semester')} placeholder="e.g. Semester 4" /></label><label>Email<input required type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" /></label>{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? 'Checking in…' : 'Check in'}</button></form></section></main>;
}

function WaitingRoom() {
  const [session] = useState(loadSession); const [lobby, setLobby] = useState(null); const [error, setError] = useState('');
  useEffect(() => {
    if (!session?.eventId) { location.replace('/join'); return undefined; }
    let active = true;
    const refresh = async () => { try { const { data, error: rpcError } = await getClient().rpc('get_event_lobby', { p_event_id: session.eventId }); if (rpcError) throw rpcError; if (active) setLobby(Array.isArray(data) ? data[0] : data); } catch (err) { if (active) setError(err.message); } };
    refresh(); const timer = setInterval(refresh, 3000); return () => { active = false; clearInterval(timer); };
  }, [session?.eventId]);
  if (!session) return null;
  const live = lobby?.event_status === 'live';
  return <main className="attendee-shell"><section className="attendee-card waiting-card"><span className="eyebrow">TINKERBINGO</span><h1>{live ? 'The hunt has started!' : 'You’re checked in'}</h1><p>{live ? 'Your grid is being prepared. Keep this page open.' : 'Waiting for the host to start the game.'}</p><div className="lobby-count"><strong>{lobby?.registered_count ?? '—'}</strong><span>people registered</span></div>{error && <p className="error">{error}</p>}<p className="muted">{lobby?.event_name || 'Loading event…'}</p></section></main>;
}

export default function AttendeeApp() { return location.pathname === '/waiting' ? <WaitingRoom /> : <JoinPage />; }
