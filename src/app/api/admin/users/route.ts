import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const ROLES = ['student', 'teacher', 'admin', 'parent'];

/**
 * Administrator inviterer en ny bruker til egen skole.
 * Åpen registrering er slått av; dette er eneste vei inn.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single();
  if (me?.role !== 'admin' || !me.school_id) return NextResponse.json({ error: 'Kun administrator' }, { status: 403 });

  const { email, fullName, role, classId } = await req.json().catch(() => ({}));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) return NextResponse.json({ error: 'Ugyldig e-post' }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Ugyldig rolle' }, { status: 400 });
  if (!fullName || String(fullName).length > 100) return NextResponse.json({ error: 'Ugyldig navn' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Invitasjon feilet' }, { status: 400 });

  await admin.from('profiles').update({ role, school_id: role === 'parent' ? null : me.school_id, full_name: fullName })
    .eq('id', data.user.id);
  if (role === 'student') {
    // klassen må tilhøre administratorens skole
    const { data: cls } = classId
      ? await supabase.from('classes').select('id').eq('id', classId).single()
      : { data: null };
    await admin.from('students').insert({
      profile_id: data.user.id, school_id: me.school_id, class_id: cls?.id ?? null, full_name: fullName, email: email.toLowerCase(),
    });
  }
  return NextResponse.json({ ok: true, id: data.user.id });
}
