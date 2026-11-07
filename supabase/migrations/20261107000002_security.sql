-- =====================================================================
-- SkoleHub – tilgangskontroll (RLS), revisjonslogg og GDPR-funksjoner
-- Prinsipp: alt er stengt som standard. Hver tabell åpnes eksplisitt
-- per rolle. Skoler er strengt separert via school_id.
-- =====================================================================

-- ---------- Hjelpefunksjoner (SECURITY DEFINER, unngår RLS-rekursjon) -
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.students where profile_id = auth.uid()
$$;

-- Foresatt med verifisert og gyldig behandlingsgrunnlag
create or replace function public.is_guardian_of(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guardianships g
    where g.student_id = sid
      and g.parent_profile_id = auth.uid()
      and g.verified_at is not null
      and (g.valid_until is null or g.valid_until >= current_date)
  )
$$;

-- Lærer som underviser eleven i minst ett fag
create or replace function public.teaches_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students st
    join public.subjects su on su.class_id = st.class_id
    where st.id = sid and su.teacher_id = auth.uid()
  )
$$;

create or replace function public.can_view_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    sid = public.my_student_id()
    or public.is_guardian_of(sid)
    or (public.app_role() = 'teacher' and public.teaches_student(sid))
    or (public.app_role() = 'admin' and exists (
          select 1 from public.students s where s.id = sid and s.school_id = public.app_school())), false)
$$;

-- Foresatte har ikke nødvendigvis school_id i profilen; da brukes barnets skole.
create or replace function public.app_school_or_child_school(target uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when public.app_school() = target then target
    when exists (
      select 1 from public.guardianships g join public.students s on s.id = g.student_id
      where g.parent_profile_id = auth.uid() and g.verified_at is not null and s.school_id = target)
    then target
    else null end
$$;

create or replace function public.can_view_subject(subj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subjects su
    where su.id = subj
      and su.school_id = public.app_school_or_child_school(su.school_id)
      and (
        (public.app_role() = 'admin')
        or su.teacher_id = auth.uid()
        or (public.app_role() = 'teacher' and exists (
              select 1 from public.subjects x where x.class_id = su.class_id and x.teacher_id = auth.uid()))
        or su.class_id = (select class_id from public.students where id = public.my_student_id())
        or exists (
              select 1 from public.guardianships g
              join public.students st on st.id = g.student_id
              where g.parent_profile_id = auth.uid()
                and g.verified_at is not null
                and (g.valid_until is null or g.valid_until >= current_date)
                and st.class_id = su.class_id)
      )
  )
$$;

create or replace function public.can_manage_subject(subj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subjects su
    where su.id = subj
      and su.school_id = public.app_school()
      and (su.teacher_id = auth.uid() or public.app_role() = 'admin')
  )
$$;

-- ---------- Ny bruker => profil (alltid laveste rolle) --------------
-- Rolle og skole settes KUN av administrator. Ingen selvregistrering
-- kan gi seg selv lærer/admin-rettigheter.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          new.email, 'student')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hindre at brukere endrer egen rolle/skole
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.app_role()::text, '') <> 'admin' then
    if new.role is distinct from old.role or new.school_id is distinct from old.school_id then
      raise exception 'Kun administrator kan endre rolle eller skole';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Elever kan bare oppdatere egen status/innleveringstid – aldri karakter
create or replace function public.guard_submission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.app_role() = 'student' then
    if new.student_id is distinct from public.my_student_id() then
      raise exception 'Elever kan bare endre egne innleveringer';
    end if;
    if tg_op = 'INSERT' then
      if new.grade is not null or new.assessment is not null then
        raise exception 'Elever kan ikke sette karakter eller vurdering';
      end if;
    elsif new.grade is distinct from old.grade or new.assessment is distinct from old.assessment then
      raise exception 'Elever kan ikke sette karakter eller vurdering';
    end if;
    if new.status = 'fullfort' and (tg_op = 'INSERT' or old.status <> 'fullfort') then
      -- "Fullført" settes av lærer etter vurdering
      raise exception 'Status Fullført settes av lærer';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_submission before insert or update on public.submissions
  for each row execute function public.guard_submission();

-- ---------- Revisjonslogg (tilgangslogging) --------------------------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor_id, school_id, action, table_name, record_id, details)
  values (
    auth.uid(),
    coalesce((rec->>'school_id')::uuid,
             (select school_id from public.students where id = (rec->>'student_id')::uuid)),
    tg_op,
    tg_table_name,
    (rec->>'id')::uuid,
    -- Logg hvilke felt som endret seg, ikke innholdet (dataminimering)
    case when tg_op = 'UPDATE' then
      jsonb_build_object('changed', (
        select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(to_jsonb(new)) k
        where to_jsonb(new)->k is distinct from to_jsonb(old)->k))
    else '{}'::jsonb end
  );
  return coalesce(new, old);
end $$;

create trigger audit_absences after insert or update or delete on public.absences
  for each row execute function public.audit_row();
create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function public.audit_row();
create trigger audit_submissions after update of grade, assessment on public.submissions
  for each row execute function public.audit_row();
create trigger audit_guardianships after insert or update or delete on public.guardianships
  for each row execute function public.audit_row();
create trigger audit_students after insert or update or delete on public.students
  for each row execute function public.audit_row();

-- Eksplisitt lesetilgang (f.eks. åpning av sykemelding) logges via RPC
create or replace function public.log_document_access(doc uuid, act text default 'VIEW')
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = doc;
  if d.id is null then return false; end if;
  if not coalesce(d.student_id = public.my_student_id() or public.is_guardian_of(d.student_id)
          or (public.app_role() = 'admin' and d.school_id = public.app_school()), false) then
    insert into public.audit_log (actor_id, school_id, action, table_name, record_id, details)
    values (auth.uid(), d.school_id, 'DENIED', 'documents', doc, jsonb_build_object('attempt', act));
    return false;
  end if;
  insert into public.audit_log (actor_id, school_id, action, table_name, record_id)
  values (auth.uid(), d.school_id, upper(act), 'documents', doc);
  return true;
end $$;

-- ---------- GDPR: innsyn/eksport og sletting -------------------------
create or replace function public.gdpr_export_student(sid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not coalesce(sid = public.my_student_id() or public.is_guardian_of(sid)
          or (public.app_role() = 'admin' and exists (
                select 1 from public.students where id = sid and school_id = public.app_school())), false) then
    raise exception 'Ingen tilgang til eksport';
  end if;
  select jsonb_build_object(
    'exported_at', now(),
    'student', (select to_jsonb(s) from public.students s where s.id = sid),
    'submissions', (select coalesce(jsonb_agg(x), '[]') from public.submissions x where x.student_id = sid),
    'test_results', (select coalesce(jsonb_agg(x), '[]') from public.test_results x where x.student_id = sid),
    'personal_activities', (select coalesce(jsonb_agg(x), '[]') from public.assignments x where x.student_id = sid),
    'absences', (select coalesce(jsonb_agg(x), '[]') from public.absences x where x.student_id = sid),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'date', x.date, 'document_type', x.document_type,
        'documentation_status', x.documentation_status, 'created_at', x.created_at)), '[]')
      from public.documents x where x.student_id = sid),
    'guardianships', (select coalesce(jsonb_agg(jsonb_build_object(
        'legal_basis', g.legal_basis, 'verified_at', g.verified_at, 'valid_until', g.valid_until)), '[]')
      from public.guardianships g where g.student_id = sid)
  ) into result;

  insert into public.audit_log (actor_id, school_id, action, table_name, record_id)
  select auth.uid(), school_id, 'EXPORT', 'students', sid from public.students where id = sid;
  return result;
end $$;

-- Returnerer lagringsstier slik at API-et kan slette filene i Storage.
create or replace function public.gdpr_erase_student(sid uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare paths text[]; sch uuid;
begin
  select school_id into sch from public.students where id = sid;
  if sch is null then raise exception 'Ukjent elev'; end if;
  if not coalesce(public.app_role() = 'admin' and sch = public.app_school(), false) then
    raise exception 'Kun skoleadministrator kan slette elevdata';
  end if;
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}')
    into paths from public.documents where student_id = sid;
  delete from public.students where id = sid;   -- kaskaderer til alle elevdata
  insert into public.audit_log (actor_id, school_id, action, table_name, record_id)
  values (auth.uid(), sch, 'ERASE', 'students', sid);
  return paths;
end $$;

-- ---------- Row Level Security ---------------------------------------
alter table public.schools        enable row level security;
alter table public.school_years   enable row level security;
alter table public.classes        enable row level security;
alter table public.profiles       enable row level security;
alter table public.students       enable row level security;
alter table public.guardianships  enable row level security;
alter table public.subjects       enable row level security;
alter table public.assignments    enable row level security;
alter table public.submissions    enable row level security;
alter table public.tests          enable row level security;
alter table public.test_results   enable row level security;
alter table public.absences       enable row level security;
alter table public.documents      enable row level security;
alter table public.integrations   enable row level security;
alter table public.sync_runs      enable row level security;
alter table public.audit_log      enable row level security;

-- Skoler / skoleår / klasser: les innenfor egen skole
create policy schools_read on public.schools for select to authenticated
  using (id = public.app_school_or_child_school(id));
create policy schools_admin on public.schools for update to authenticated
  using (id = public.app_school() and public.app_role() = 'admin');

create policy years_read on public.school_years for select to authenticated
  using (school_id = public.app_school_or_child_school(school_id));
create policy years_admin on public.school_years for all to authenticated
  using (school_id = public.app_school() and public.app_role() = 'admin')
  with check (school_id = public.app_school() and public.app_role() = 'admin');

create policy classes_read on public.classes for select to authenticated
  using (school_id = public.app_school_or_child_school(school_id));
create policy classes_admin on public.classes for all to authenticated
  using (school_id = public.app_school() and public.app_role() = 'admin')
  with check (school_id = public.app_school() and public.app_role() = 'admin');

-- Profiler: egen profil, ansatte på egen skole (for lærernavn), admin alle på skolen
create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid()
         or (school_id = public.app_school_or_child_school(school_id) and role in ('teacher', 'admin'))
         or (public.app_role() = 'admin' and school_id = public.app_school()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or (public.app_role() = 'admin' and school_id = public.app_school()))
  with check (id = auth.uid() or (public.app_role() = 'admin' and (school_id = public.app_school() or school_id is null)));

-- Elever
create policy students_read on public.students for select to authenticated
  using (public.can_view_student(id));
create policy students_admin on public.students for all to authenticated
  using (public.app_role() = 'admin' and school_id = public.app_school())
  with check (public.app_role() = 'admin' and school_id = public.app_school());

-- Foresatte
create policy guardianships_read on public.guardianships for select to authenticated
  using (parent_profile_id = auth.uid()
         or student_id = public.my_student_id()
         or (public.app_role() = 'admin' and exists (
               select 1 from public.students s where s.id = student_id and s.school_id = public.app_school())));
create policy guardianships_admin on public.guardianships for all to authenticated
  using (public.app_role() = 'admin' and exists (
           select 1 from public.students s where s.id = student_id and s.school_id = public.app_school()))
  with check (public.app_role() = 'admin' and exists (
           select 1 from public.students s where s.id = student_id and s.school_id = public.app_school()));

-- Fag
create policy subjects_read on public.subjects for select to authenticated
  using (public.can_view_subject(id));
create policy subjects_admin on public.subjects for all to authenticated
  using (public.app_role() = 'admin' and school_id = public.app_school())
  with check (public.app_role() = 'admin' and school_id = public.app_school());

-- Oppgaver
create policy assignments_read on public.assignments for select to authenticated
  using (
    (student_id is null and subject_id is not null and public.can_view_subject(subject_id))
    or (student_id is not null and (student_id = public.my_student_id() or public.is_guardian_of(student_id)))
  );
create policy assignments_teacher_write on public.assignments for all to authenticated
  using (student_id is null and public.can_manage_subject(subject_id))
  with check (student_id is null and public.can_manage_subject(subject_id) and school_id = public.app_school());
create policy assignments_personal on public.assignments for all to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id() and school_id = public.app_school()
              and source_platform = 'manual'
              and (subject_id is null or public.can_view_subject(subject_id)));

-- Innleveringer
create policy submissions_read on public.submissions for select to authenticated
  using (public.can_view_student(student_id)
         and (public.app_role() <> 'teacher' or exists (
               select 1 from public.assignments a where a.id = assignment_id and public.can_manage_subject(a.subject_id))));
create policy submissions_student on public.submissions for all to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());
create policy submissions_teacher on public.submissions for all to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_manage_subject(a.subject_id)))
  with check (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_manage_subject(a.subject_id)));

-- Prøver
create policy tests_read on public.tests for select to authenticated
  using (public.can_view_subject(subject_id));
create policy tests_write on public.tests for all to authenticated
  using (public.can_manage_subject(subject_id))
  with check (public.can_manage_subject(subject_id) and school_id = public.app_school());

create policy test_results_read on public.test_results for select to authenticated
  using (student_id = public.my_student_id() or public.is_guardian_of(student_id)
         or exists (select 1 from public.tests t where t.id = test_id and public.can_manage_subject(t.subject_id)));
create policy test_results_write on public.test_results for all to authenticated
  using (exists (select 1 from public.tests t where t.id = test_id and public.can_manage_subject(t.subject_id)))
  with check (exists (select 1 from public.tests t where t.id = test_id and public.can_manage_subject(t.subject_id)));

-- Fravær: elev, verifisert foresatt, lærer som underviser eleven, admin
create policy absences_read on public.absences for select to authenticated
  using (public.can_view_student(student_id));
create policy absences_write on public.absences for all to authenticated
  using (school_id = public.app_school()
         and (public.app_role() = 'admin' or (public.app_role() = 'teacher' and public.teaches_student(student_id))))
  with check (school_id = public.app_school()
         and (public.app_role() = 'admin' or (public.app_role() = 'teacher' and public.teaches_student(student_id))));

-- Dokumentasjon: IKKE lærere. Kun elev selv, verifisert foresatt og admin.
create policy documents_read on public.documents for select to authenticated
  using (student_id = public.my_student_id()
         or public.is_guardian_of(student_id)
         or (public.app_role() = 'admin' and school_id = public.app_school()));
create policy documents_insert on public.documents for insert to authenticated
  with check ((student_id = public.my_student_id() or public.is_guardian_of(student_id))
              and documentation_status = 'venter'
              and school_id = (select school_id from public.students where id = student_id));
create policy documents_admin on public.documents for update to authenticated
  using (public.app_role() = 'admin' and school_id = public.app_school())
  with check (public.app_role() = 'admin' and school_id = public.app_school());
create policy documents_delete on public.documents for delete to authenticated
  using (student_id = public.my_student_id()
         or (public.app_role() = 'admin' and school_id = public.app_school()));

-- Integrasjoner: kun administrator
create policy integrations_admin on public.integrations for all to authenticated
  using (public.app_role() = 'admin' and school_id = public.app_school())
  with check (public.app_role() = 'admin' and school_id = public.app_school());
create policy integrations_staff_read on public.integrations for select to authenticated
  using (public.app_role() = 'teacher' and school_id = public.app_school());
create policy sync_runs_admin on public.sync_runs for select to authenticated
  using (school_id = public.app_school() and public.app_role() in ('admin', 'teacher'));

-- Revisjonslogg: kun lesing for admin på egen skole. Skrives bare av triggere/funksjoner.
create policy audit_admin_read on public.audit_log for select to authenticated
  using (public.app_role() = 'admin' and school_id = public.app_school());

-- Ingen tilgang for anonyme brukere
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
grant select on public.activities to authenticated;
revoke execute on function public.gdpr_erase_student(uuid) from public, anon;
revoke execute on function public.gdpr_export_student(uuid) from public, anon;
grant execute on function public.gdpr_erase_student(uuid) to authenticated;
grant execute on function public.gdpr_export_student(uuid) to authenticated;
