import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT = 3001 } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const app = express();
app.use(cors());
app.use(express.json());

const fail = (res, error, status = 400) => res.status(status).json({ error: error.message ?? String(error) });

app.post('/api/events', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Event name is required.' });
  const { data, error } = await supabase.from('events').insert({ name }).select().single();
  if (error) return fail(res, error);
  res.status(201).json({ event: data });
});

// Deliberately local-only: creates enough predictable players to exercise a
// real grid without asking classmates to register during development.
app.post('/api/dev/events/:eventId/seed', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  const players = [
    ['Aarav Mehta', 'CSE', 'Semester 4', 'D2A3'], ['Diya Shah', 'ECE', 'Semester 4', 'D3B4'],
    ['Kabir Singh', 'ME', 'Semester 6', 'D4C5'], ['Anaya Patel', 'CSE', 'Semester 2', 'D5E6'],
    ['Vivaan Rao', 'EEE', 'Semester 4', 'D6F7'], ['Isha Nair', 'IT', 'Semester 6', 'D7G8'],
    ['Arjun Das', 'CIVIL', 'Semester 2', 'D8H9'], ['Meera Jain', 'ECE', 'Semester 6', 'D9J2'],
    ['Rohan Gupta', 'CSE', 'Semester 4', 'D2K3'], ['Saanvi Roy', 'IT', 'Semester 2', 'D3L4'],
  ];
  try {
    const eventId = req.params.eventId;
    const { data: event, error: eventError } = await supabase.from('events').select('status').eq('id', eventId).single();
    if (eventError) return fail(res, eventError);
    if (event.status !== 'registering') return res.status(400).json({ error: 'Seed players can only be added before the game starts.' });
    const rows = players.map(([name, branch, semester, secret_code], index) => ({ event_id: eventId, name, branch, semester, secret_code, email: `demo-player-${index + 1}@tinkerbingo.test` }));
    const { error } = await supabase.from('attendees').upsert(rows, { onConflict: 'event_id,email', ignoreDuplicates: true });
    if (error) return fail(res, error);
    const { data, error: listError } = await supabase.from('attendees').select('name,branch,semester,secret_code').eq('event_id', eventId).like('email', '%@tinkerbingo.test').order('name');
    if (listError) return fail(res, listError);
    res.json({ players: data });
  } catch (error) { return fail(res, error, 500); }
});

app.get('/api/events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const [{ data: event, error: eventError }, { data: attendees, error: attendeeError }, { data: leaderboard, error: leaderboardError }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('attendees').select('id,name,branch,semester,email,status,created_at,completed_at').eq('event_id', eventId).order('created_at'),
    supabase.rpc('get_event_leaderboard', { p_event_id: eventId }),
  ]);
  if (eventError) return fail(res, eventError, eventError.code === 'PGRST116' ? 404 : 400);
  if (attendeeError) return fail(res, attendeeError);
  if (leaderboardError) return fail(res, leaderboardError);
  res.json({ event, attendees, leaderboard });
});

app.post('/api/events/:eventId/end', async (req, res) => {
  const { error } = await supabase.from('events').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', req.params.eventId).eq('status', 'live');
  if (error) return fail(res, error);
  res.status(204).end();
});

app.post('/api/events/:eventId/start', async (req, res) => {
  const gridSize = Number(req.body.gridSize);
  if (![10, 15, 20].includes(gridSize)) return res.status(400).json({ error: 'Grid size must be 10, 15, or 20.' });
  const { error } = await supabase.rpc('generate_grids', { p_event_id: req.params.eventId, p_grid_size: gridSize });
  if (error) return fail(res, error);
  res.status(204).end();
});

app.post('/api/uploads/:eventId/:cellId', async (req, res) => {
  try {
    const { eventId, cellId } = req.params;
    const { data: cell, error: cellError } = await supabase.from('grid_cells').select('id').eq('id', cellId).eq('event_id', eventId).eq('status', 'pending').single();
    if (cellError || !cell) return fail(res, cellError ?? new Error('Grid cell not found.'), 404);
    const path = `${eventId}/${cellId}.jpg`;
    const { data, error } = await supabase.storage.from('selfies').createSignedUploadUrl(path, { upsert: true });
    if (error) return fail(res, error);
    res.json({ path, token: data.token });
  } catch (error) { return fail(res, error, 500); }
});

app.listen(PORT, () => console.log(`TinkerBingo host API listening on :${PORT}`));
