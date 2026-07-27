import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Something went wrong.');
  return response.status === 204 ? null : response.json();
};

const suggestedGrid = (count) => count - 1 >= 20 ? 20 : count - 1 >= 15 ? 15 : count - 1 >= 10 ? 10 : null;
const displayDate = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));

function EventSetup({ onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function create(e) {
    e.preventDefault(); setLoading(true); setError('');
    try { onCreated((await api('/events', { method: 'POST', body: JSON.stringify({ name }) })).event); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <main className="setup-shell"><section className="setup-card">
    <span className="eyebrow">HOST DASHBOARD</span><h1>Tinker<span>Bingo</span></h1>
    <p>Create an event, share its QR code, then start the hunt when everyone is checked in.</p>
    <form onSubmit={create}><label>Event name<input autoFocus required maxLength="160" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Freshers' Mixer" /></label>
      {error && <p className="error">{error}</p>}<button disabled={loading}>{loading ? 'Creating…' : 'Create event'}</button></form>
  </section></main>;
}

function Dashboard({ initialEvent }) {
  const [snapshot, setSnapshot] = useState({ event: initialEvent, attendees: [] });
  const [expected, setExpected] = useState('');
  const [gridSize, setGridSize] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const event = snapshot.event;
  const count = snapshot.attendees.length;
  const proposed = suggestedGrid(count);
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const joinUrl = `${appUrl}/join?event=${event.id}`;

  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const data = await api(`/events/${event.id}`); if (active) setSnapshot(data); } catch (err) { if (active) setNotice(err.message); } };
    refresh(); const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [event.id]);
  useEffect(() => setGridSize(proposed), [proposed]);

  async function start() {
    if (!gridSize) return;
    setBusy(true); setNotice('');
    try { await api(`/events/${event.id}/start`, { method: 'POST', body: JSON.stringify({ gridSize }) }); setNotice('Game started — attendees are being sent to their grids.'); const data = await api(`/events/${event.id}`); setSnapshot(data); }
    catch (err) { setNotice(err.message); } finally { setBusy(false); }
  }
  const missing = expected === '' ? null : Math.max(0, Number(expected) - count);
  return <main className="dashboard"><header><div><span className="eyebrow">HOST DASHBOARD</span><h1>{event.name}</h1><p className={`status ${event.status}`}>{event.status}</p></div><button className="quiet" onClick={() => { localStorage.removeItem('tinkerBingoHostEvent'); location.reload(); }}>New event</button></header>
    <div className="dashboard-grid"><section className="card qr-card"><h2>Check-in QR</h2><div className="qr"><QRCodeSVG value={joinUrl} size={220} includeMargin /></div><a href={joinUrl} target="_blank" rel="noreferrer">Open registration link</a><code>{joinUrl}</code></section>
      <section className="card monitor"><h2>Registration monitor</h2><div className="count"><strong>{count}</strong><span>registered</span></div><label>Expected headcount <input type="number" min="0" value={expected} onChange={e => setExpected(e.target.value)} placeholder="Optional" /></label>{missing !== null && <p className="muted">{missing === 0 ? 'Everyone expected is checked in.' : `${missing} more expected.`}</p>}
        <div className="start-panel"><h3>Start game</h3>{event.status === 'registering' ? <>{proposed ? <p>{count} players supports a <b>{proposed}-cell</b> grid.</p> : <p className="warning">Not enough attendees — need at least 11.</p>}<label>Grid size<select value={gridSize ?? ''} onChange={e => setGridSize(Number(e.target.value))} disabled={!proposed}><option value="">Choose size</option><option value="10">10 cells</option><option value="15" disabled={count < 16}>15 cells</option><option value="20" disabled={count < 21}>20 cells</option></select></label><button onClick={start} disabled={!gridSize || busy}>{busy ? 'Starting…' : 'Start game'}</button></> : <p className="live-message">Game is {event.status}. Grid: {event.grid_size} cells.</p>}</div>{notice && <p className="notice">{notice}</p>}</section>
      <section className="card attendees"><div className="card-title"><h2>Attendees</h2><span>{count}</span></div>{count === 0 ? <p className="muted">Waiting for the first QR scan…</p> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Branch</th><th>Semester</th><th>Status</th><th>Checked in</th></tr></thead><tbody>{snapshot.attendees.map(a => <tr key={a.id}><td>{a.name}</td><td>{a.branch}</td><td>{a.semester}</td><td><span className={`pill ${a.status}`}>{a.status}</span></td><td>{displayDate(a.created_at)}</td></tr>)}</tbody></table></div>}</section>
    </div>
  </main>;
}

export default function App() {
  const [event, setEvent] = useState(() => { try { return JSON.parse(localStorage.getItem('tinkerBingoHostEvent')); } catch { return null; } });
  const selectEvent = (next) => { localStorage.setItem('tinkerBingoHostEvent', JSON.stringify(next)); setEvent(next); };
  return event ? <Dashboard initialEvent={event} /> : <EventSetup onCreated={selectEvent} />;
}
