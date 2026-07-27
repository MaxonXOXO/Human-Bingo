import { getSupabase, methodNotAllowed, sendError } from '../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  try {
    const { eventId } = req.query;
    const supabase = getSupabase();
    const [{ data: event, error: eventError }, { data: attendees, error: attendeeError }, { data: leaderboard, error: leaderboardError }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('attendees').select('id,name,branch,semester,email,status,created_at,completed_at').eq('event_id', eventId).order('created_at'),
      supabase.rpc('get_event_leaderboard', { p_event_id: eventId }),
    ]);
    if (eventError) return sendError(res, eventError);
    if (attendeeError) return sendError(res, attendeeError);
    if (leaderboardError) return sendError(res, leaderboardError);
    return res.status(200).json({ event, attendees, leaderboard });
  } catch (error) {
    return sendError(res, error, 500);
  }
}
