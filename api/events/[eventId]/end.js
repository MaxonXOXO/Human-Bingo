import { getSupabase, methodNotAllowed, sendError } from '../../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  try {
    const { error } = await getSupabase().from('events').update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', req.query.eventId).eq('status', 'live');
    if (error) return sendError(res, error);
    return res.status(204).end();
  } catch (error) { return sendError(res, error, 500); }
}
