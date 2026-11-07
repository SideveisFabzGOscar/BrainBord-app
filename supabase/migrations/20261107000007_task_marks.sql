-- =====================================================================
-- SkoleHub – «Løst»-avhuking i gjennomføringsplanen
-- Eleven kan markere en oppgave som løst. Markeringen er personlig og
-- påvirker bare elevens egen plan, bjelle og humørfjes. Den endrer IKKE
-- innleveringsstatus i Canvas/Teams (de er kun lesbare for SkoleHub).
-- =====================================================================
create table public.task_marks (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source     text not null check (source in ('skolehub', 'canvas', 'teams')),
  item_id    text not null,          -- assignments/tests.id (skolehub) eller external_items.id
  marked_at  timestamptz not null default now(),
  unique (profile_id, source, item_id)
);
create index on public.task_marks (profile_id);

alter table public.task_marks enable row level security;
create policy own_marks on public.task_marks for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
grant select, insert, delete on public.task_marks to authenticated;
revoke all on public.task_marks from anon;
