import { AuditLog, GdprExport, ProfileForm, UserAdmin } from '@/components/settings';
import { PageHeader } from '@/components/ui';
import { ROLE_LABEL, type Role } from '@/lib/meta';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Innstillinger' };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-6 p-6 md:grid-cols-[240px_1fr]">
      <div><h2 className="font-medium">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>
      <div>{children}</div>
    </section>
  );
}

export default async function InnstillingerPage() {
  const s = await getSession();
  const supabase = await createClient();
  const isAdmin = s.role === 'admin';

  let users: { id: string; full_name: string; email: string | null; role: Role }[] = [];
  let audit: { id: number; at: string; action: string; table_name: string; actor: string | null }[] = [];
  let classes: { id: string; name: string }[] = [];
  let students: { id: string; full_name: string }[] = [];
  if (isAdmin) {
    const [u, a, c, st] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').eq('school_id', s.schoolId!).order('full_name'),
      supabase.from('audit_log').select('id, at, action, table_name, actor_id').order('at', { ascending: false }).limit(100),
      supabase.from('classes').select('id, name').order('name'),
      supabase.from('students').select('id, full_name').order('full_name'),
    ]);
    users = (u.data ?? []) as typeof users;
    const names = new Map(users.map((x) => [x.id, x.full_name]));
    audit = (a.data ?? []).map((r) => ({ id: r.id, at: r.at, action: r.action, table_name: r.table_name, actor: r.actor_id ? names.get(r.actor_id) ?? 'Annen bruker' : null }));
    classes = c.data ?? [];
    students = st.data ?? [];
  }

  return (
    <>
      <PageHeader title="Innstillinger" description={`${ROLE_LABEL[s.role]} · ${s.schoolName ?? ''}`} />
      <div className="space-y-6">
        <Section title="Profil" description="Navnet ditt slik det vises i SkoleHub."><ProfileForm fullName={s.fullName} email={s.email} /></Section>
        <Section title="Utseende" description="Bytt mellom lyst og mørkt tema med sol/måne-ikonet øverst til høyre. Valget lagres i nettleseren.">
          <p className="text-sm text-muted">Følger systeminnstillingen til du velger selv.</p>
        </Section>
        <Section title="Personvern og innsyn" description="Du har rett til innsyn i og kopi av opplysningene som er lagret om deg (GDPR art. 15 og 20).">
          <div className="space-y-3 text-sm">
            {s.studentId && <GdprExport studentId={s.studentId} label={s.role === 'parent' ? `Last ned data om ${s.studentName}` : 'Last ned mine data (JSON)'} />}
            <ul className="list-inside list-disc space-y-1 text-muted">
              <li>Behandlingsansvarlig er skoleeier (kommune/fylkeskommune).</li>
              <li>Behandlingsgrunnlag: offentlig myndighetsutøvelse etter opplæringslova (GDPR art. 6 nr. 1 e) og for helseopplysninger art. 9 nr. 2 g.</li>
              <li>Sletting av konto og data gjøres av skoleadministrasjonen. Ta kontakt med skolen.</li>
              <li>All tilgang til sykemeldinger og fravær logges.</li>
            </ul>
          </div>
        </Section>
        {isAdmin && (
          <>
            <Section title="Brukere og tilgang" description="Roller styrer hva hver bruker kan se. Tilgang håndheves i databasen (Row Level Security).">
              <UserAdmin users={users} me={s.userId} classes={classes} students={students} />
            </Section>
            <Section title="Tilgangslogg" description="Siste 100 hendelser på sensitive data: fravær, dokumenter, karakterer, elevregister.">
              <AuditLog rows={audit} />
            </Section>
          </>
        )}
      </div>
    </>
  );
}
