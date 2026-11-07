-- Sanntidsoppdatering av årshjulet når aktiviteter opprettes eller importeres.
-- Supabase Realtime respekterer RLS for postgres_changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.assignments, public.tests, public.submissions;
  end if;
end $$;
