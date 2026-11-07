-- =====================================================================
-- SkoleHub – direkte navigering til oppgaver og prøver i kildesystemet
-- Lenker kommer KUN fra leverandørenes API (Canvas html_url, Graph webUrl)
-- eller fra skolens egen import. Ingen URL-er konstrueres.
--   link_kind = 'direkte'  lenken åpner nøyaktig denne oppgaven/prøven
--               'fag'      lenken åpner faget/emnet (oppgaven har ingen egen lenke)
--               'system'   bare innloggingssiden til systemet er kjent
-- =====================================================================

alter table public.external_items
  add column if not exists link_kind text check (link_kind in ('direkte', 'fag', 'system')),
  add column if not exists course_url text check (course_url is null or course_url ~ '^https://');
update public.external_items set link_kind = 'direkte' where url is not null and link_kind is null;

-- Skolenivå-import (admin) kan også ha originallenker
alter table public.assignments
  add column if not exists source_url text check (source_url is null or source_url ~ '^https://'),
  add column if not exists source_course_id text;
alter table public.tests
  add column if not exists source_url text check (source_url is null or source_url ~ '^https://'),
  add column if not exists source_course_id text;

-- Årshjul-visningen får lenken med (nye kolonner må ligge sist i en eksisterende visning)
create or replace view public.activities
with (security_invoker = true) as
select
  a.id, 'assignment'::text as kind, a.activity_type::text as activity_type, a.title, a.description,
  coalesce(a.starts_at, a.due_at) as starts_at, a.due_at as date, a.subject_id, s.name as subject_name, s.code as subject_code,
  p.full_name as teacher_name, a.status::text as default_status, a.source_platform::text as source_platform,
  a.student_id as personal_student_id, a.school_id,
  a.source_url, a.external_id
from public.assignments a
left join public.subjects s on s.id = a.subject_id
left join public.profiles p on p.id = s.teacher_id
union all
select
  t.id, 'test', t.test_type::text, t.title, t.description, t.test_date, t.test_date, t.subject_id, s.name, s.code,
  p.full_name, 'ikke_startet', t.source_platform::text, null, t.school_id,
  t.source_url, t.external_id
from public.tests t
join public.subjects s on s.id = t.subject_id
left join public.profiles p on p.id = s.teacher_id;
grant select on public.activities to authenticated;
