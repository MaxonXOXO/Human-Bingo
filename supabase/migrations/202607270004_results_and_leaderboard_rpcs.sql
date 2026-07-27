create or replace function public.get_event_leaderboard(p_event_id uuid)
returns table (
  placement bigint,
  attendee_id uuid,
  attendee_name text,
  attendee_status text,
  completed_count bigint,
  total_cells bigint,
  completed_at timestamptz
)
language sql security definer set search_path = public stable as $$
  with stats as (
    select a.id, a.name, a.status, a.completed_at,
      count(gc.id) filter (where gc.status = 'completed') as completed_count,
      count(gc.id) as total_cells
    from public.attendees a left join public.grid_cells gc on gc.owner_id = a.id
    where a.event_id = p_event_id
    group by a.id
  )
  select rank() over (order by (status = 'completed') desc, completed_at asc nulls last, completed_count desc, name) as placement,
    id, name, status, completed_count, total_cells, completed_at
  from stats
  order by placement, name;
$$;

create or replace function public.get_attendee_result(p_attendee_id uuid)
returns table (
  event_id uuid,
  event_status text,
  attendee_name text,
  started_at timestamptz,
  attendee_completed_at timestamptz,
  completed_count bigint,
  total_cells bigint
)
language sql security definer set search_path = public stable as $$
  select e.id, e.status, a.name, e.started_at, a.completed_at,
    count(gc.id) filter (where gc.status = 'completed'), count(gc.id)
  from public.attendees a join public.events e on e.id = a.event_id
  left join public.grid_cells gc on gc.owner_id = a.id
  where a.id = p_attendee_id
  group by e.id, a.id;
$$;

create or replace function public.get_grid_cell_details(p_cell_id uuid)
returns table (target_name text, target_branch text, target_semester text)
language sql security definer set search_path = public stable as $$
  select a.name, a.branch, a.semester from public.grid_cells gc
  join public.attendees a on a.id = gc.target_id where gc.id = p_cell_id;
$$;

grant execute on function public.get_event_leaderboard(uuid) to anon, authenticated;
grant execute on function public.get_attendee_result(uuid) to anon, authenticated;
grant execute on function public.get_grid_cell_details(uuid) to anon, authenticated;
