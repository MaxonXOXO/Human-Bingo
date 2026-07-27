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

app.get('/api/events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const [{ data: event, error: eventError }, { data: attendees, error: attendeeError }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('attendees').select('id,name,branch,semester,email,status,created_at,completed_at').eq('event_id', eventId).order('created_at'),
  ]);
  if (eventError) return fail(res, eventError, eventError.code === 'PGRST116' ? 404 : 400);
  if (attendeeError) return fail(res, attendeeError);
  res.json({ event, attendees });
});

app.post('/api/events/:eventId/start', async (req, res) => {
  const gridSize = Number(req.body.gridSize);
  if (![10, 15, 20].includes(gridSize)) return res.status(400).json({ error: 'Grid size must be 10, 15, or 20.' });
  const { error } = await supabase.rpc('generate_grids', { p_event_id: req.params.eventId, p_grid_size: gridSize });
  if (error) return fail(res, error);
  res.status(204).end();
});

app.listen(PORT, () => console.log(`TinkerBingo host API listening on :${PORT}`));
