-- =====================================================================
-- SkoleHub – elevens egen status på oppgaver fra Canvas/Teams
-- (Ikke levert / Pågår / Levert). SkoleHub kan ikke skrive tilbake til
-- Canvas/Teams, så statusen lagres her og vises som «din status».
-- For SkoleHub-oppgaver oppdateres innleveringen (submissions) direkte.
-- =====================================================================
create table public.task_status (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source     text not null check (source in ('canvas', 'teams')),
  item_id    text not null,
  status     text not null check (status in ('ikke_levert', 'pagar', 'levert')),
  updated_at timestamptz not null default now(),
  unique (profile_id, source, item_id)
);
alter table public.task_status enable row level security;
create policy own_task_status on public.task_status for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on public.task_status to authenticated;
revoke all on public.task_status from anon;
