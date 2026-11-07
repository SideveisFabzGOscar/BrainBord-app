import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { Welcome } from '@/components/welcome';
import { bellItems } from '@/lib/bell';
import { moodOf } from '@/lib/catchup';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadUnified } from '@/lib/unified-data';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  // Bjella gjelder elevens egne oppgaver (elev, eller foresatt for valgt barn)
  const b = s.studentId ? bellItems((await loadUnified(await createClient(), s)).tasks, Date.now()) : null;
  const bell = b ? { ...b, mood: moodOf(b.items) } : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={s.role} schoolName={s.schoolName} />
      <div className="min-w-0 flex-1">
        <Welcome firstName={s.fullName.split(' ')[0]} />
        <Topbar fullName={s.fullName} role={s.role} kids={s.children} currentChild={s.studentId} bell={bell} />
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
