-- Selfie uploads use upsert so a player can retry a failed capture for the
-- same grid cell. The initial migration allowed inserts only; Storage also
-- checks UPDATE RLS when the upsert header is present.
drop policy if exists "anonymous selfie updates to valid-looking paths" on storage.objects;

create policy "anonymous selfie updates to valid-looking paths"
on storage.objects for update to anon, authenticated
using (
  bucket_id = 'selfies'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
)
with check (
  bucket_id = 'selfies'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
);
