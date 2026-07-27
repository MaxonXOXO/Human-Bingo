import { getSupabase, methodNotAllowed, sendError } from '../../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const { eventId, cellId } = req.query;
  try {
    const supabase = getSupabase();
    const { data: cell, error: cellError } = await supabase.from('grid_cells')
      .select('id').eq('id', cellId).eq('event_id', eventId).eq('status', 'pending').single();
    if (cellError || !cell) return sendError(res, cellError ?? new Error('Grid cell not found.'), 404);
    const path = `${eventId}/${cellId}.jpg`;
    const { data, error } = await supabase.storage.from('selfies').createSignedUploadUrl(path, { upsert: true });
    if (error) return sendError(res, error);
    return res.status(200).json({ path, token: data.token });
  } catch (error) { return sendError(res, error, 500); }
}
