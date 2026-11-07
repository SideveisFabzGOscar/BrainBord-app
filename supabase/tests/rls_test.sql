-- =====================================================================
-- RLS-/tilgangstester for SkoleHub. Kjør mot en database med migrasjoner
-- og seed:  psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Hver test feiler med en tydelig melding hvis tilgangsreglene brytes.
-- =====================================================================
\set QUIET on
select id as elev     from auth.users where email = 'elev@skolehub.test' \gset
select id as forelder from auth.users where email = 'forelder@skolehub.test' \gset
select id as t_mat    from auth.users where email = 'laerer.matte@skolehub.test' \gset
select id as admin    from auth.users where email = 'admin@skolehub.test' \gset
select id as admin2   from auth.users where email = 'admin@lindas.test' \gset
select id as emma_sid from public.students where email = 'elev@skolehub.test' \gset
select id as jonas_sid from public.students where email = 'elev2@skolehub.test' \gset
select count(*) as n_2sta_asg from public.assignments a join public.subjects s on s.id=a.subject_id
  join public.classes c on c.id=s.class_id where c.name='2STA' \gset
select a.id as norsk_subject from public.subjects a join public.classes c on c.id=a.class_id
  where c.name='2STA' and a.code='NOR1260' \gset
select a.id as mat_subject from public.subjects a join public.classes c on c.id=a.class_id
  where c.name='2STA' and a.code='MAT1001' \gset
select id as emma_asg from public.assignments a where subject_id = :'mat_subject' order by due_at desc limit 1 \gset
select id as jonas_doc_target from public.students where email = 'elev2@skolehub.test' \gset

-- ============ ELEV ============
set role authenticated;
select set_config('request.jwt.claim.sub', :'elev', false) \gset _
select set_config('t.n2sta', :'n_2sta_asg', false), set_config('t.emma', :'emma_sid', false),
       set_config('t.jonas', :'jonas_sid', false), set_config('t.asg', :'emma_asg', false) \gset _
do $$ begin
  assert (select count(*) from students) = 1, 'Elev skal bare se seg selv';
  assert (select count(*) from assignments) = current_setting('t.n2sta')::int + 2,
         'Elev skal se klassens oppgaver + egne personlige aktiviteter';
  assert (select count(*) from absences where student_id <> current_setting('t.emma')::uuid) = 0, 'Elev ser andres fravær';
  assert (select count(*) from absences) > 0, 'Elev skal se eget fravær';
  assert (select count(*) from submissions where student_id <> current_setting('t.emma')::uuid) = 0, 'Elev ser andres innleveringer';
  assert (select count(*) from schools) = 1, 'Elev ser andre skoler';
  assert (select count(*) from audit_log) = 0, 'Elev skal ikke se revisjonslogg';
  assert (select count(*) from integrations) = 0, 'Elev skal ikke se integrasjoner';
  assert (select count(*) from activities) = current_setting('t.n2sta')::int + 2
         + (select count(*) from tests), 'Årshjul-visningen skal følge RLS';
  raise notice 'OK  elev: lesetilgang';
end $$;

-- Elev kan sette status Levert på egen innlevering
insert into submissions (student_id, assignment_id, status, submitted_at)
values (:'emma_sid', :'emma_asg', 'levert', now())
on conflict (student_id, assignment_id) do update set status = 'levert', submitted_at = now();
do $$ begin raise notice 'OK  elev: kan levere egen oppgave'; end $$;

do $$ begin
  begin
    update submissions set grade = '6' where student_id = current_setting('t.emma')::uuid;
    raise exception 'FEIL: elev kunne sette karakter';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  begin
    insert into submissions (student_id, assignment_id, status)
    values (current_setting('t.jonas')::uuid, current_setting('t.asg')::uuid, 'levert');
    raise exception 'FEIL: elev kunne levere for en annen elev';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  begin
    update profiles set role = 'admin' where id = auth.uid();
    raise exception 'FEIL: elev kunne gjøre seg selv til admin';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  begin
    insert into documents (student_id, school_id, date, document_type)
    select current_setting('t.jonas')::uuid, school_id, current_date, 'egenmelding' from students limit 1;
    raise exception 'FEIL: elev kunne laste opp dokument for en annen elev';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  assert (select gdpr_export_student(current_setting('t.emma')::uuid)) ? 'absences', 'Elev skal kunne eksportere egne data';
  raise notice 'OK  elev: skrivebeskyttelse (karakter, andre elever, rolle, dokumenter) + GDPR-eksport';
end $$;

-- ============ LÆRER ============
select set_config('request.jwt.claim.sub', :'t_mat', false) \gset _
select set_config('t.norsk', :'norsk_subject', false), set_config('t.mat', :'mat_subject', false) \gset _
do $$ begin
  assert (select count(*) from students) = 44, 'Matematikklærer skal se elevene i 2STA og 2STB';
  assert (select count(*) from documents) = 0, 'Lærer skal IKKE se sykemeldinger/dokumentasjon';
  assert (select count(*) from absences) > 0, 'Lærer skal se relevant fravær';
  assert (select count(*) from integrations where status is not null) >= 1, 'Lærer skal se integrasjonsstatus';
  insert into tests (school_id, subject_id, title, test_date)
  select school_id, id, 'RLS-testprøve', now() + interval '10 days' from subjects where id = current_setting('t.mat')::uuid;
  begin
    insert into assignments (school_id, subject_id, title, due_at)
    select school_id, id, 'Skal feile', now() from subjects where id = current_setting('t.norsk')::uuid;
    raise exception 'FEIL: lærer kunne opprette oppgave i andres fag';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  begin
    perform gdpr_export_student(current_setting('t.emma')::uuid);
    raise exception 'FEIL: lærer kunne eksportere elevdata';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  raise notice 'OK  lærer: egne klasser, ingen helsedokumenter, kun egne fag';
end $$;

-- ============ FORELDER ============
select set_config('request.jwt.claim.sub', :'forelder', false) \gset _
do $$ begin
  assert (select count(*) from students) = 1, 'Forelder skal bare se eget barn';
  assert (select count(*) from absences where student_id <> current_setting('t.emma')::uuid) = 0, 'Forelder ser andres fravær';
  assert (select count(*) from documents) = 3, 'Forelder skal se barnets dokumentasjon';
  assert (select count(*) from assignments) = current_setting('t.n2sta')::int + 2, 'Forelder skal se barnets oppgaver';
  raise notice 'OK  forelder: kun eget barn med verifisert grunnlag';
end $$;

-- Uverifisert foresatt => ingen tilgang
reset role;
update guardianships set verified_at = null;
set role authenticated;
do $$ begin
  assert (select count(*) from students) = 0, 'Uverifisert foresatt skal ikke ha tilgang';
  raise notice 'OK  forelder: uverifisert grunnlag gir ingen tilgang';
end $$;
reset role;
update guardianships set verified_at = now();
set role authenticated;

-- ============ ADMIN, ANNEN SKOLE ============
select set_config('request.jwt.claim.sub', :'admin2', false) \gset _
do $$ begin
  assert (select count(*) from students) = 1, 'Admin på skole 2 skal bare se egen skole';
  assert (select count(*) from absences) = 0, 'Skoleseparasjon brutt (fravær)';
  begin
    perform gdpr_erase_student(current_setting('t.emma')::uuid);
    raise exception 'FEIL: admin kunne slette elev på annen skole';
  exception when others then
    if sqlerrm like 'FEIL%' then raise; end if;
  end;
  raise notice 'OK  skoleseparasjon';
end $$;

-- ============ ADMIN ============
select set_config('request.jwt.claim.sub', :'admin', false) \gset _
do $$ begin
  assert (select count(*) from students) = 44, 'Admin skal se alle elever på egen skole';
  assert (select count(*) from documents) = 3, 'Admin skal kunne behandle dokumentasjon';
  assert (select count(*) from audit_log) > 0, 'Admin skal se revisjonslogg';
  assert (select count(*) from integrations) = 6, 'Admin skal se integrasjoner';
  assert log_document_access((select id from documents limit 1), 'VIEW'), 'Tilgangslogging feilet';
  assert (select count(*) from audit_log where action = 'VIEW') = 1, 'VIEW ble ikke logget';
  raise notice 'OK  admin: lesing, dokumentbehandling, tilgangslogg';
end $$;
do $$ declare paths text[]; begin
  paths := gdpr_erase_student(current_setting('t.jonas')::uuid);
  assert (select count(*) from students where id = current_setting('t.jonas')::uuid) = 0, 'Sletting feilet';
  assert (select count(*) from audit_log where action = 'ERASE') = 1, 'Sletting ble ikke logget';
  raise notice 'OK  GDPR-sletting med revisjonsspor';
end $$;
reset role;
\echo 'Alle RLS-tester bestått'
