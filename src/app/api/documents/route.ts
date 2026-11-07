import { NextResponse } from 'next/server';
import { detectMime, encrypt } from '@/lib/crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const DOC_TYPES = ['legeerklaering', 'egenmelding', 'permisjonssoknad', 'annen_dokumentasjon'];

/**
 * Sikker opplasting av dokumentasjon (sykemelding m.m.)
 * 1) Metadata settes inn med brukerens klient => RLS avgjør om brukeren får lov
 * 2) Filen valideres (type fra innhold, maks 10 MB), krypteres med AES-256-GCM
 * 3) Kryptert fil lagres i privat bucket med service role
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  const studentId = String(form.get('studentId') ?? '');
  const documentType = String(form.get('documentType') ?? '');
  const date = String(form.get('date') ?? '');
  const absenceId = form.get('absenceId') ? String(form.get('absenceId')) : null;

  if (!(file instanceof File)) return NextResponse.json({ error: 'Mangler fil' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Maks 10 MB' }, { status: 413 });
  if (!DOC_TYPES.includes(documentType)) return NextResponse.json({ error: 'Ugyldig dokumenttype' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Ugyldig dato' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(buf);
  if (!mime) return NextResponse.json({ error: 'Kun PDF, PNG eller JPG er tillatt' }, { status: 415 });

  const { data: student } = await supabase.from('students').select('school_id').eq('id', studentId).single();
  if (!student) return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });

  const { data: doc, error } = await supabase.from('documents').insert({
    student_id: studentId, school_id: student.school_id, absence_id: absenceId, date,
    document_type: documentType, documentation_status: 'venter', mime_type: mime, size_bytes: buf.length, uploaded_by: user.id,
  }).select('id').single();
  if (error || !doc) return NextResponse.json({ error: 'Ingen tilgang til å laste opp for denne eleven' }, { status: 403 });

  const admin = createAdminClient();
  const { iv, payload } = encrypt(buf);
  // Stien inneholder bare ID-er, aldri navn eller filnavn fra brukeren
  const path = `${student.school_id}/${studentId}/${doc.id}.bin`;
  const up = await admin.storage.from('documents').upload(path, payload, { contentType: 'application/octet-stream', upsert: false });
  if (up.error) {
    await admin.from('documents').delete().eq('id', doc.id);
    return NextResponse.json({ error: 'Lagring feilet' }, { status: 500 });
  }
  await admin.from('documents').update({ storage_path: path, encryption_iv: iv }).eq('id', doc.id);
  if (absenceId) await admin.from('absences').update({ documentation_status: 'venter' })
    .eq('id', absenceId).eq('student_id', studentId).neq('documentation_status', 'godkjent');
  return NextResponse.json({ id: doc.id });
}
