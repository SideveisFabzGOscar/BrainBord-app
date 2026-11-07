import { Sidebar } from '@/components/sidebar';
import { Topbar, type Deadline } from '@/components/topbar';
import { loadActivities } from '@/lib/data';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const supabase = await createClient();
  const now = Date.now();
  const week = now + 7 * 86_400_000;
  const deadlines: Deadline[] = (await loadActivities(supabase, s))
    .filter((a) => { const t = new Date(a.date).getTime(); return t >= now && t <= week && a.status !== 'levert' && a.status !== 'fullfort'; })
    .slice(0, 8)
    .map((a) => ({ id: a.id, title: a.title, date: a.date, activityType: a.activityType, subjectName: a.subjectName }));

  return (
    <div className="flex min-h-screen">
      <Sidebar role={s.role} schoolName={s.schoolName} />
      <div className="min-w-0 flex-1">
        <Topbar fullName={s.fullName} role={s.role} kids={s.children} currentChild={s.studentId} deadlines={deadlines} />
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
