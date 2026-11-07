-- =====================================================================
-- SkoleHub – kjerneskjema
-- Tabellnavn er på engelsk (konvensjon), se README for norsk mapping:
--   schools=Skoler, students=Elever, subjects=Fag, assignments=Oppgaver,
--   submissions=Innleveringer, tests=Prøver, absences=Fravær,
--   documents=Sykemeldinger og dokumentasjon, integrations=Integrasjoner
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enum-typer ----------------------------------------------
create type public.user_role as enum ('student', 'teacher', 'admin', 'parent');

-- Aktivitetstyper i årshjulet (fargekoder settes i frontend)
create type public.activity_type as enum (
  'innlevering', 'oppgave', 'lekse', 'prosjekt', 'presentasjon', 'frist', 'annet'
);
create type public.test_type as enum ('prove', 'eksamen');

create type public.work_status as enum ('ikke_startet', 'pagar', 'levert', 'fullfort');

create type public.source_platform as enum (
  'manual', 'teams', 'itslearning', 'iskole', 'canvas', 'csv', 'mock'
);

create type public.absence_type as enum (
  'sykdom', 'legetime', 'permisjon', 'skoleaktivitet', 'annet', 'udokumentert'
);
create type public.documentation_status as enum (
  'ikke_dokumentert', 'venter', 'godkjent', 'avvist'
);
create type public.document_type as enum (
  'legeerklaering', 'egenmelding', 'permisjonssoknad', 'annen_dokumentasjon'
);

create type public.integration_status as enum (
  'ikke_tilkoblet', 'tilkoblet', 'feil', 'deaktivert', 'testmodus'
);
create type public.sync_status as enum ('kjorer', 'vellykket', 'delvis', 'feilet');

-- ---------- Skoler, skoleår, klasser --------------------------------
create table public.schools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  organization  text,                 -- f.eks. fylkeskommune / kommune
  org_number    text,
  created_at    timestamptz not null default now()
);

create table public.school_years (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  label      text not null,           -- "2026/2027"
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on),
  unique (school_id, label)
);

create table public.classes (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  name           text not null,       -- "2STA"
  unique (school_year_id, name)
);

-- ---------- Brukere ---------------------------------------------------
-- profiles.id = auth.users.id (Supabase Auth)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  school_id  uuid references public.schools(id) on delete set null,
  role       public.user_role not null default 'student',
  full_name  text not null,
  email      text,
  created_at timestamptz not null default now()
);

-- Elever (kan finnes uten innloggingskonto, f.eks. importert fra SAS)
create table public.students (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  school_id  uuid not null references public.schools(id) on delete cascade,
  class_id   uuid references public.classes(id) on delete set null,
  full_name  text not null,
  email      text,
  created_at timestamptz not null default now()
);
create index on public.students (class_id);
create index on public.students (school_id);

-- Foresatt-tilgang krever dokumentert behandlingsgrunnlag
create table public.guardianships (
  id                uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  legal_basis       text not null,     -- f.eks. "foreldreansvar (elev under 18)" / "samtykke"
  verified_at       timestamptz,       -- null = ikke verifisert => ingen tilgang
  valid_until       date,              -- typisk elevens 18-årsdag
  unique (parent_profile_id, student_id)
);

-- ---------- Fag -------------------------------------------------------
create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  name       text not null,
  code       text not null,            -- Udir-fagkode, f.eks. NOR1260
  teacher_id uuid references public.profiles(id) on delete set null,
  color      text,
  unique (class_id, code)
);
create index on public.subjects (teacher_id);

-- ---------- Oppgaver (innleveringer, lekser, prosjekter, frister …) --
create table public.assignments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  subject_id      uuid references public.subjects(id) on delete cascade,
  title           text not null,
  description     text,
  activity_type   public.activity_type not null default 'oppgave',
  starts_at       timestamptz,
  due_at          timestamptz not null,
  status          public.work_status not null default 'ikke_startet', -- fallback når elev ikke har innlevering
  source_platform public.source_platform not null default 'manual',
  external_id     text,
  -- personlig aktivitet: synlig kun for denne eleven
  student_id      uuid references public.students(id) on delete cascade,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- duplikatkontroll for importerte data
  constraint assignments_external_unique unique (school_id, source_platform, external_id),
  constraint personal_or_subject check (subject_id is not null or student_id is not null)
);
create index on public.assignments (subject_id, due_at);
create index on public.assignments (student_id);

-- ---------- Innleveringer --------------------------------------------
create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  submitted_at  timestamptz,
  status        public.work_status not null default 'ikke_startet',
  assessment    text,       -- vurdering/tilbakemelding (kun lærer)
  grade         text,       -- karakter (kun lærer)
  updated_at    timestamptz not null default now(),
  unique (student_id, assignment_id)
);

-- ---------- Prøver og eksamen ----------------------------------------
create table public.tests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  title           text not null,
  description     text,
  test_type       public.test_type not null default 'prove',
  test_date       timestamptz not null,
  source_platform public.source_platform not null default 'manual',
  external_id     text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint tests_external_unique unique (school_id, source_platform, external_id)
);
create index on public.tests (subject_id, test_date);

create table public.test_results (
  id         uuid primary key default gen_random_uuid(),
  test_id    uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  result     text,
  status     public.work_status not null default 'ikke_startet',
  unique (test_id, student_id)
);

-- ---------- Fravær ----------------------------------------------------
create table public.absences (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.students(id) on delete cascade,
  school_id            uuid not null references public.schools(id) on delete cascade,
  subject_id           uuid references public.subjects(id) on delete set null,
  date                 date not null,
  from_time            time,
  to_time              time,
  absence_type         public.absence_type not null default 'udokumentert',
  hours                numeric(4,2) not null check (hours >= 0 and hours <= 24),
  documentation_status public.documentation_status not null default 'ikke_dokumentert',
  source_platform      public.source_platform not null default 'manual',
  external_id          text,
  created_at           timestamptz not null default now(),
  constraint absences_external_unique unique (school_id, source_platform, external_id),
  check (to_time is null or from_time is null or to_time > from_time)
);
create index on public.absences (student_id, date);

-- ---------- Sykemeldinger / dokumentasjon (særlig beskyttet) ---------
-- Dataminimering: INGEN diagnose eller helsedetaljer lagres her.
-- Selve filen ligger kryptert (AES-256-GCM, applikasjonsnivå) i privat
-- Storage-bucket; tabellen holder bare en referanse.
create table public.documents (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.students(id) on delete cascade,
  school_id            uuid not null references public.schools(id) on delete cascade,
  absence_id           uuid references public.absences(id) on delete set null,
  date                 date not null,
  document_type        public.document_type not null,
  documentation_status public.documentation_status not null default 'venter',
  storage_path         text,          -- sikker dokumentreferanse (bucket-sti)
  encryption_iv        text,          -- IV for AES-GCM (nøkkel ligger i server-miljø, aldri i DB)
  mime_type            text,
  size_bytes           integer,
  uploaded_by          uuid references public.profiles(id) on delete set null,
  retain_until         date not null default (current_date + interval '1 year')::date,
  created_at           timestamptz not null default now()
);
create index on public.documents (student_id);

-- ---------- Integrasjoner --------------------------------------------
create table public.integrations (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  platform        public.source_platform not null,
  display_name    text not null,
  status          public.integration_status not null default 'ikke_tilkoblet',
  -- Ikke-hemmelig konfig (tenant-id, base-URL). Hemmeligheter ligger i
  -- servermiljø/Supabase Vault, aldri i denne kolonnen.
  config          jsonb not null default '{}'::jsonb,
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  unique (school_id, platform)
);

create table public.sync_runs (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  school_id      uuid not null references public.schools(id) on delete cascade,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         public.sync_status not null default 'kjorer',
  created_count  integer not null default 0,
  updated_count  integer not null default 0,
  skipped_count  integer not null default 0,
  error_count    integer not null default 0,
  log            jsonb not null default '[]'::jsonb,
  triggered_by   uuid references public.profiles(id) on delete set null
);
create index on public.sync_runs (integration_id, started_at desc);

-- ---------- Tilgangslogg / revisjon ----------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  school_id   uuid,
  action      text not null,      -- INSERT/UPDATE/DELETE/VIEW/DOWNLOAD/EXPORT/ERASE
  table_name  text not null,
  record_id   uuid,
  details     jsonb not null default '{}'::jsonb
);
create index on public.audit_log (school_id, at desc);

-- ---------- updated_at-trigger ---------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_assignments_touch before update on public.assignments
  for each row execute function public.touch_updated_at();
create trigger trg_submissions_touch before update on public.submissions
  for each row execute function public.touch_updated_at();

-- ---------- Samlet aktivitetsvisning for årshjulet -------------------
-- security_invoker => RLS på underliggende tabeller gjelder.
create or replace view public.activities
with (security_invoker = true) as
select
  a.id,
  'assignment'::text            as kind,
  a.activity_type::text         as activity_type,
  a.title,
  a.description,
  coalesce(a.starts_at, a.due_at) as starts_at,
  a.due_at                      as date,
  a.subject_id,
  s.name                        as subject_name,
  s.code                        as subject_code,
  p.full_name                   as teacher_name,
  a.status::text                as default_status,
  a.source_platform::text       as source_platform,
  a.student_id                  as personal_student_id,
  a.school_id
from public.assignments a
left join public.subjects s on s.id = a.subject_id
left join public.profiles p on p.id = s.teacher_id
union all
select
  t.id,
  'test',
  t.test_type::text,
  t.title,
  t.description,
  t.test_date,
  t.test_date,
  t.subject_id,
  s.name,
  s.code,
  p.full_name,
  'ikke_startet',
  t.source_platform::text,
  null,
  t.school_id
from public.tests t
join public.subjects s on s.id = t.subject_id
left join public.profiles p on p.id = s.teacher_id;
