-- =====================================================================
-- SkoleHub – sikker dokumentlagring
-- Privat bucket. Det finnes BEVISST ingen storage-policyer for
-- 'authenticated': klienter kan aldri lese/skrive filer direkte.
-- All tilgang går via server-API (/api/documents/*) som
--   1) sjekker tilgang mot RLS i databasen,
--   2) krypterer/dekrypterer filen (AES-256-GCM),
--   3) logger tilgangen i audit_log.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documents', 'documents', false, 10485760,
            array['application/octet-stream'])   -- filene er kryptert før opplasting
    on conflict (id) do update set public = false;
  end if;
end $$;

-- Automatisk sletting av dokumentasjon etter oppbevaringstid (kjøres av pg_cron / planlagt jobb)
create or replace function public.purge_expired_documents() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with gone as (
    delete from public.documents where retain_until < current_date returning id, school_id
  )
  insert into public.audit_log (actor_id, school_id, action, table_name, record_id, details)
  select null, school_id, 'PURGE', 'documents', id, '{"reason":"retention_expired"}'::jsonb from gone;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_expired_documents() from public, anon, authenticated;
