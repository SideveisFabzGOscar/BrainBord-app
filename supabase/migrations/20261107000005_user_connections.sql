-- =====================================================================
-- SkoleHub – personlige tilkoblinger (OAuth per bruker)
-- Hver bruker kobler sin EGEN Canvas-/Microsoft-konto. Data som hentes
-- med brukerens token er bare synlig for brukeren selv.
-- Tokens lagres kryptert (AES-256-GCM) og kan ALDRI leses av klienten.
-- =====================================================================

create type public.connection_status as enum ('ikke_tilkoblet', 'tilkoblet', 'feilet');

create table public.user_connections (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  platform          text not null check (platform in ('canvas', 'teams', 'iskole')),
  status            public.connection_status not null default 'ikke_tilkoblet',
  account_label     text,          -- f.eks. navn i Canvas (aldri e-post/passord)
  external_user_id  text,
  scopes            text[] not null default '{}',
  token_ciphertext  text,          -- kryptert JSON {access_token, refresh_token}
  token_iv          text,
  access_expires_at timestamptz,
  connected_at      timestamptz,
  last_synced_at    timestamptz,
  last_error        text,          -- brukervennlig melding, uten tokens
  error_code        text,          -- TOKEN_EXPIRED | FORBIDDEN | CONSENT_REQUIRED | RATE_LIMITED | UPSTREAM | NOT_CONFIGURED
  updated_at        timestamptz not null default now(),
  unique (profile_id, platform)
);

-- Data hentet med brukerens egen tilgang
create table public.external_items (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  platform          text not null check (platform in ('canvas', 'teams', 'iskole')),
  kind              text not null check (kind in ('oppgave', 'prove', 'kunngjoring', 'fag', 'hendelse', 'melding')),
  external_id       text not null,
  course_id         text,
  course_name       text,
  title             text not null,
  body              text,
  author            text,          -- avsender (kunngjøring/melding)
  ends_at           timestamptz,   -- slutt for kalenderhendelser
  due_at            timestamptz,
  published_at      timestamptz,
  url               text check (url is null or url ~ '^https://'),
  submission_status text check (submission_status in ('levert', 'ikke_levert', 'forfalt', 'vurdert')),
  grade             text,
  score             numeric,
  points_possible   numeric,
  synced_at         timestamptz not null default now(),
  unique (profile_id, platform, kind, external_id)
);
create index on public.external_items (profile_id, due_at);

-- Merk syntetiske skoler tydelig i grensesnittet
alter table public.schools add column if not exists is_demo boolean not null default false;
update public.schools set is_demo = true where name like '%(TEST%';

-- ---------- Tilgang ----------
alter table public.user_connections enable row level security;
alter table public.external_items   enable row level security;

-- Brukeren ser bare egne rader. Ingen skriving fra klienten – kun server (service role).
create policy own_connections on public.user_connections for select to authenticated
  using (profile_id = auth.uid());
create policy own_items on public.external_items for select to authenticated
  using (profile_id = auth.uid());

revoke all on public.user_connections from anon, authenticated;
revoke all on public.external_items   from anon, authenticated;
-- Kolonnetilgang: tokenkolonnene kan ikke leses av noen innlogget bruker
grant select (id, profile_id, platform, status, account_label, scopes, access_expires_at,
              connected_at, last_synced_at, last_error, error_code, updated_at)
  on public.user_connections to authenticated;
grant select on public.external_items to authenticated;

-- Tilkoble/frakoble logges uten tokeninnhold
create or replace function public.audit_connection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or new.status is distinct from old.status then
    insert into public.audit_log (actor_id, school_id, action, table_name, record_id, details)
    values (coalesce(new.profile_id, old.profile_id),
            (select school_id from public.profiles where id = coalesce(new.profile_id, old.profile_id)),
            case when tg_op = 'DELETE' then 'DISCONNECT' else 'CONNECTION_' || upper(new.status::text) end,
            'user_connections', coalesce(new.id, old.id),
            jsonb_build_object('platform', coalesce(new.platform, old.platform)));
  end if;
  return coalesce(new, old);
end $$;
create trigger audit_user_connections after update or delete on public.user_connections
  for each row execute function public.audit_connection();
