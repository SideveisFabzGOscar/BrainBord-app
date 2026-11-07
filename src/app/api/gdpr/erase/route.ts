import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** GDPR art. 17: sletting. Kun skoleadministrator (kontrolleres i databasefunksjonen). */
export async function POST(req: Request) {
  const { studentId, confirm } = await req.json().catch(() => ({}));
  if (!studentId || confirm !== 'SLETT') return NextResponse.json({ error: 'Bekreft med "SLETT"' }, { status: 400 });
  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc('gdpr_erase_student', { sid: studentId });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const files = (paths as string[] | null) ?? [];
  if (files.length) await createAdminClient().storage.from('documents').remove(files);
  return NextResponse.json({ ok: true, deletedFiles: files.length });
}
