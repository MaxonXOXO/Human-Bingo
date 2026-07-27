import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Server configuration is incomplete. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  return res.status(405).json({ error: `Method not allowed. Use ${allowed}.` });
}

export function sendError(res, error, fallbackStatus = 400) {
  console.error(error);
  return res.status(error?.code === 'PGRST116' ? 404 : fallbackStatus)
    .json({ error: error?.message ?? 'An unexpected server error occurred.' });
}
