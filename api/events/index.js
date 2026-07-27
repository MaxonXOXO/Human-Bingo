import { getSupabase, methodNotAllowed, sendError } from '../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Event name is required.' });
  try {
    const { data, error } = await getSupabase().from('events').insert({ name }).select().single();
    if (error) return sendError(res, error);
    return res.status(201).json({ event: data });
  } catch (error) {
    return sendError(res, error, 500);
  }
}
