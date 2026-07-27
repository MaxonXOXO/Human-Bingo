import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './attendee.css';
import './camera.css';

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
    const refresh = async () => { try { const { data, error: rpcError } = await getClient().rpc('get_event_lobby', { p_event_id: session.eventId }); if (rpcError) throw rpcError; const next = Array.isArray(data) ? data[0] : data; if (active) { setLobby(next); if (next?.event_status === 'live') location.replace('/grid'); } } catch (err) { if (active) setError(err.message); } };
    refresh(); const timer = setInterval(refresh, 3000); return () => { active = false; clearInterval(timer); };
  }, [session?.eventId]);
  if (!session) return null;
  const live = lobby?.event_status === 'live';
  return <main className="attendee-shell"><section className="attendee-card waiting-card"><span className="eyebrow">TINKERBINGO</span><h1>{live ? 'The hunt has started!' : 'You’re checked in'}</h1><p>{live ? 'Your grid is being prepared. Keep this page open.' : 'Waiting for the host to start the game.'}</p><div className="lobby-count"><strong>{lobby?.registered_count ?? '—'}</strong><span>people registered</span></div>{error && <p className="error">{error}</p>}<p className="muted">{lobby?.event_name || 'Loading event…'}</p></section></main>;
}

function VerificationModal({ cell, session, onClose, onComplete }) {
  const [code, setCode] = useState(''); const [verified, setVerified] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null); const [previewUrl, setPreviewUrl] = useState(''); const fileInputRef = useRef(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  async function verify(e) { e.preventDefault(); setBusy(true); setError(''); try { const { data, error: rpcError } = await getClient().rpc('verify_grid_cell', { p_cell_id: cell.cell_id, p_entered_code: code }); if (rpcError) throw rpcError; if (!data) throw new Error('That code does not match. Ask the person for their code again.'); setVerified(true); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  function choosePhoto(event) {
    const nextPhoto = event.target.files?.[0]; if (!nextPhoto) return;
    if (!nextPhoto.type.startsWith('image/')) return setError('Please take a photo.');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(nextPhoto); setPreviewUrl(URL.createObjectURL(nextPhoto)); setError('');
  }
  function retake() { if (previewUrl) URL.revokeObjectURL(previewUrl); setPhoto(null); setPreviewUrl(''); if (fileInputRef.current) fileInputRef.current.value = ''; }
  async function savePhoto() {
    if (!photo) return;
    setBusy(true); setError('');
    try {
      const ticketResponse = await fetch(`/api/uploads/${session.eventId}/${cell.cell_id}`, { method: 'POST' });
      const ticket = await ticketResponse.json(); if (!ticketResponse.ok) throw new Error(ticket.error || 'Could not prepare selfie upload.');
      const { error: uploadError } = await getClient().storage.from('selfies').uploadToSignedUrl(ticket.path, ticket.token, photo, { contentType: 'image/jpeg', upsert: true }); if (uploadError) throw uploadError;
      const path = ticket.path;
      const { data, error: completeError } = await getClient().rpc('complete_grid_cell', { p_cell_id: cell.cell_id, p_selfie_url: path }); if (completeError) throw completeError; if (!data) throw new Error('This cell could not be completed.');
      await onComplete();
    } catch (err) { setError(err.message || 'Could not save selfie.'); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="verify-modal"><button className="close" onClick={onClose}>×</button><span className="eyebrow">VERIFY PLAYER</span><h2>{cell.target_initials}</h2><p>{cell.target_branch} · {cell.target_semester}</p>{!verified ? <form onSubmit={verify}><label>Ask them for their code<input autoFocus value={code} maxLength="6" onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCD" /></label><button disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</button></form> : <div className="camera-step"><p className="verified">Code confirmed. Take a selfie together.</p>{!previewUrl ? <label className="camera-button">Open phone camera<input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={choosePhoto} /></label> : <><img className="selfie-preview" src={previewUrl} alt="Selfie preview" /><div className="photo-actions"><button className="quiet" onClick={retake} disabled={busy}>Retake</button><button onClick={savePhoto} disabled={busy}>{busy ? 'Saving…' : 'Done'}</button></div></>}</div>}{error && <p className="error">{error}</p>}</section></div>;
}

function GridPage() {
  const [session] = useState(loadSession); const [cells, setCells] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState('');
  const refresh = async () => { try { const { data, error: rpcError } = await getClient().rpc('get_attendee_grid', { p_owner_id: session.attendeeId }); if (rpcError) throw rpcError; setCells(data || []); } catch (err) { setError(err.message); } };
  useEffect(() => { if (!session?.attendeeId) { location.replace('/join'); return; } refresh(); }, []);
  if (!session) return null;
  const completed = cells.filter(cell => cell.cell_status === 'completed').length;
  return <main className="grid-shell"><header className="grid-header"><span className="eyebrow">TINKERBINGO</span><h1>Find your people</h1><p>{completed}/{cells.length || '—'} completed</p><div className="progress"><span style={{ width: `${cells.length ? completed / cells.length * 100 : 0}%` }} /></div></header>{error && <p className="error">{error}</p>}{cells.length ? <section className="bingo-grid">{cells.map(cell => <button key={cell.cell_id} className={`grid-cell ${cell.cell_status}`} onClick={() => cell.cell_status !== 'completed' && setSelected(cell)}><strong>{cell.target_initials}</strong><span>{cell.target_branch}</span>{cell.cell_status === 'completed' && <i>✓</i>}</button>)}</section> : <p className="muted grid-loading">Loading your grid…</p>}{selected && <VerificationModal cell={selected} session={session} onClose={() => setSelected(null)} onComplete={async () => { await refresh(); setSelected(null); }} />}</main>;
}

export default function AttendeeApp() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/waiting') return <WaitingRoom />;
  if (path === '/grid') return <GridPage />;
  return <JoinPage />;
}
