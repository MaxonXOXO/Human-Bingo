import { getSupabase, methodNotAllowed, sendError } from '../../../_supabase.js';
import { demoRows } from '../../../_demoPlayers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!process.env.DEMO_SEED_PASSWORD || req.body?.password !== process.env.DEMO_SEED_PASSWORD) {
    return res.status(403).json({ error: 'Demo mode is disabled or the test passphrase is incorrect.' });
  }
  try {
    const eventId = req.query.eventId;
    const supabase = getSupabase();
    const { data: event, error: eventError } = await supabase.from('events').select('status').eq('id', eventId).single();
    if (eventError) return sendError(res, eventError);
    if (event.status !== 'registering') return res.status(400).json({ error: 'Demo players can only be added before the game starts.' });
    const { error } = await supabase.from('attendees').upsert(demoRows(eventId), { onConflict: 'event_id,email', ignoreDuplicates: true });
    if (error) return sendError(res, error);
    const { data, error: listError } = await supabase.from('attendees').select('name,branch,semester,secret_code').eq('event_id', eventId).like('email', '%@tinkerbingo.test').order('name');
    if (listError) return sendError(res, listError);
    return res.status(200).json({ players: data });
  } catch (error) { return sendError(res, error, 500); }
}
