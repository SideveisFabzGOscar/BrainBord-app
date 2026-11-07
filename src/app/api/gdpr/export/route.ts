import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GDPR art. 15/20: innsyn og dataportabilitet. Tilgang og logging håndteres i databasen. */
export async function GET(req: Request) {
  const studentId = new URL(req.url).searchParams.get('student');
  if (!studentId) return NextResponse.json({ error: 'Mangler elev' }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('gdpr_export_student', { sid: studentId });
  if (error) return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="skolehub-innsyn-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store, private',
    },
  });
}
