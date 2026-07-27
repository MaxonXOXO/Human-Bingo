-- The host API uses the Supabase service-role key; browser roles stay unable
-- to start or alter games directly.
grant execute on function public.generate_grids(uuid, integer) to service_role;
grant execute on function public.mark_attendee_completed(uuid) to service_role;
