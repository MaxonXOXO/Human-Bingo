-- TinkerBingo initial schema and server-side game RPCs.
-- Run this migration with the Supabase CLI or paste it into the SQL editor.

create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  status text not null default 'registering'
    check (status in ('registering', 'live', 'ended')),
  grid_size integer check (grid_size in (10, 15, 20)),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  branch text not null check (char_length(trim(branch)) between 1 and 100),
  semester text not null check (char_length(trim(semester)) between 1 and 50),
  email text not null,
  secret_code text not null check (secret_code ~ '^[A-HJ-NP-Z2-9]{4}$'),
  status text not null default 'registered'
    check (status in ('registered', 'playing', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (event_id, email),
  unique (event_id, secret_code)
);

create table public.grid_cells (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  owner_id uuid not null references public.attendees(id) on delete cascade,
  target_id uuid not null references public.attendees(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  selfie_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (owner_id <> target_id),
  unique (owner_id, target_id)
);

create index grid_cells_owner_id_idx on public.grid_cells (owner_id);
create index grid_cells_event_id_idx on public.grid_cells (event_id);
create index attendees_event_id_idx on public.attendees (event_id);
create index grid_cells_event_completed_idx on public.grid_cells (event_id, completed_at desc)
  where status = 'completed';

alter table public.events enable row level security;
alter table public.attendees enable row level security;
alter table public.grid_cells enable row level security;

-- No direct browser table policies are intentionally created.  Reads and writes
-- are exposed through the narrowly scoped functions below.

create or replace function public.make_secret_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  for i in 1..4 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.register_attendee(
  p_event_id uuid,
  p_name text,
  p_branch text,
  p_semester text,
  p_email text
)
returns table (
  attendee_id uuid,
  event_id uuid,
  attendee_name text,
  branch text,
  semester text,
  email text,
  secret_code text,
  attendee_status text,
  recovered boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.attendees%rowtype;
  v_event_status text;
  v_code text;
  v_new public.attendees%rowtype;
  v_email text := lower(trim(p_email));
begin
  select status into v_event_status from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;

  select * into v_existing
  from public.attendees
  where attendees.event_id = p_event_id and attendees.email = v_email;
  if found then
    return query select v_existing.id, v_existing.event_id, v_existing.name, v_existing.branch,
      v_existing.semester, v_existing.email, v_existing.secret_code, v_existing.status, true;
    return;
  end if;

  if v_event_status <> 'registering' then
    raise exception 'Registration is closed' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_name)), 0) = 0 or coalesce(length(trim(p_branch)), 0) = 0
     or coalesce(length(trim(p_semester)), 0) = 0 or v_email = '' then
    raise exception 'All registration fields are required' using errcode = '22023';
  end if;

  loop
    v_code := public.make_secret_code();
    begin
      insert into public.attendees (event_id, name, branch, semester, email, secret_code)
      values (p_event_id, trim(p_name), trim(p_branch), trim(p_semester), v_email, v_code)
      returning * into v_new;
      exit;
    exception when unique_violation then
      -- A concurrent registration may have picked this code/email. Recover the
      -- existing email; otherwise retry with a new random code.
      select * into v_existing from public.attendees
      where attendees.event_id = p_event_id and attendees.email = v_email;
      if found then
        return query select v_existing.id, v_existing.event_id, v_existing.name, v_existing.branch,
          v_existing.semester, v_existing.email, v_existing.secret_code, v_existing.status, true;
        return;
      end if;
    end;
  end loop;

  return query select v_new.id, v_new.event_id, v_new.name, v_new.branch,
    v_new.semester, v_new.email, v_new.secret_code, v_new.status, false;
end;
$$;

create or replace function public.generate_grids(p_event_id uuid, p_grid_size integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count integer;
begin
  select status into v_status from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if v_status <> 'registering' then raise exception 'Game has already started or ended' using errcode = 'P0001'; end if;
  if p_grid_size not in (10, 15, 20) then raise exception 'Grid size must be 10, 15, or 20' using errcode = '22023'; end if;

  select count(*) into v_count from public.attendees where event_id = p_event_id;
  if v_count - 1 < p_grid_size then raise exception 'Not enough attendees for this grid size' using errcode = '22023'; end if;

  insert into public.grid_cells (event_id, owner_id, target_id)
  select p_event_id, owners.id, targets.id
  from public.attendees owners
  cross join lateral (
    select candidates.id
    from public.attendees candidates
    where candidates.event_id = p_event_id and candidates.id <> owners.id
    order by random()
    limit p_grid_size
  ) targets
  where owners.event_id = p_event_id;

  update public.attendees set status = 'playing' where event_id = p_event_id;
  update public.events set status = 'live', grid_size = p_grid_size, started_at = now() where id = p_event_id;
end;
$$;

create or replace function public.verify_grid_cell(p_cell_id uuid, p_entered_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_code text;
  v_event_status text;
begin
  select a.secret_code, e.status into v_expected_code, v_event_status
  from public.grid_cells gc
  join public.attendees a on a.id = gc.target_id
  join public.events e on e.id = gc.event_id
  where gc.id = p_cell_id and gc.status = 'pending';

  if not found or v_event_status <> 'live' then return false; end if;
  return v_expected_code = upper(trim(p_entered_code));
end;
$$;

-- Read model for the attendee grid. It deliberately exposes initials instead
-- of the target's full name and never exposes target secret codes.
create or replace function public.get_attendee_grid(p_owner_id uuid)
returns table (
  cell_id uuid,
  event_id uuid,
  target_id uuid,
  target_initials text,
  target_branch text,
  target_semester text,
  cell_status text,
  selfie_url text,
  verified_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select gc.id, gc.event_id, gc.target_id,
    upper(left(split_part(trim(a.name), ' ', 1), 1)) || '.' ||
      case when array_length(regexp_split_to_array(trim(a.name), '\s+'), 1) > 1
        then upper(left((regexp_split_to_array(trim(a.name), '\s+'))[array_length(regexp_split_to_array(trim(a.name), '\s+'), 1)], 1)) || '.'
        else '' end,
    a.branch, a.semester, gc.status, gc.selfie_url, gc.verified_at, gc.completed_at
  from public.grid_cells gc
  join public.attendees a on a.id = gc.target_id
  where gc.owner_id = p_owner_id
  order by gc.created_at;
$$;

create or replace function public.get_event_lobby(p_event_id uuid)
returns table (event_name text, event_status text, grid_size integer, registered_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select e.name, e.status, e.grid_size,
    (select count(*) from public.attendees a where a.event_id = e.id)
  from public.events e
  where e.id = p_event_id;
$$;

create or replace function public.mark_attendee_completed(p_attendee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attendees a
  set status = 'completed', completed_at = coalesce(a.completed_at, now())
  where a.id = p_attendee_id
    and not exists (
      select 1 from public.grid_cells gc
      where gc.owner_id = p_attendee_id and gc.status <> 'completed'
    );
  return found;
end;
$$;

create or replace function public.complete_grid_cell(p_cell_id uuid, p_selfie_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_event_id uuid;
begin
  select owner_id, event_id into v_owner_id, v_event_id
  from public.grid_cells where id = p_cell_id and status = 'pending' for update;
  if not found then return false; end if;
  if not exists (select 1 from public.events where id = v_event_id and status = 'live') then return false; end if;
  if p_selfie_url is null or p_selfie_url !~ ('^' || v_event_id::text || '/' || p_cell_id::text || '\.jpg$') then
    raise exception 'Invalid selfie path' using errcode = '22023';
  end if;

  update public.grid_cells
  set status = 'completed', selfie_url = p_selfie_url, verified_at = now(), completed_at = now()
  where id = p_cell_id;
  perform public.mark_attendee_completed(v_owner_id);
  return true;
end;
$$;

-- Browser clients may invoke only attendee flow functions. Do not grant
-- generate_grids or host override access to anon/authenticated; invoke those
-- through a server route using the Supabase service-role key.
revoke all on function public.make_secret_code() from public;
revoke all on function public.generate_grids(uuid, integer) from public;
grant execute on function public.register_attendee(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.verify_grid_cell(uuid, text) to anon, authenticated;
grant execute on function public.complete_grid_cell(uuid, text) to anon, authenticated;
grant execute on function public.get_attendee_grid(uuid) to anon, authenticated;
grant execute on function public.get_event_lobby(uuid) to anon, authenticated;
revoke all on function public.mark_attendee_completed(uuid) from public;

-- Public read supports host thumbnails. The app must upload the exact object
-- path `<event_id>/<cell_id>.jpg`; complete_grid_cell validates that same path.
insert into storage.buckets (id, name, public) values ('selfies', 'selfies', true)
on conflict (id) do update set public = excluded.public;

create policy "anonymous selfie uploads to valid-looking paths"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'selfies'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
);
