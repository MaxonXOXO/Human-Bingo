import { getSupabase, methodNotAllowed, sendError } from '../../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const gridSize = Number(req.body?.gridSize);
  if (![10, 15, 20].includes(gridSize)) {
    return res.status(400).json({ error: 'Grid size must be 10, 15, or 20.' });
  }
  try {
    const { error } = await getSupabase().rpc('generate_grids', {
      p_event_id: req.query.eventId,
      p_grid_size: gridSize,
    });
    if (error) return sendError(res, error);
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error, 500);
  }
}
