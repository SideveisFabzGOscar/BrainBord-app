-- Elever kan ikke legge ut oppgaver eller prøver.
-- Før kunne en elev opprette og endre «personlige aktiviteter» (assignments med student_id).
-- Nå er det bare lærer (for egne fag) og admin som kan opprette oppgaver og prøver.
-- Eleven kan fortsatt:
--   * lese klassens oppgaver og prøver
--   * sette egen status (submissions, task_status, task_marks)
--   * slette gamle personlige aktiviteter som allerede finnes
-- Prøver (public.tests) var allerede begrenset til lærer/admin via tests_write.

drop policy if exists assignments_personal on public.assignments;

create policy assignments_personal_delete on public.assignments for delete to authenticated
  using (student_id is not null and student_id = public.my_student_id());
