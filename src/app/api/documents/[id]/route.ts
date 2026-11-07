import { NextResponse } from 'next/server';
import { decrypt } from '@/lib/crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Nedlasting av dokument: tilgang sjekkes og logges i databasen før filen dekrypteres */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc('log_document_access', { doc: id, act: 'DOWNLOAD' });
  if (!allowed) return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });

  const { data: doc } = await supabase.from('documents')
    .select('storage_path, encryption_iv, mime_type, document_type, date').eq('id', id).single();
  if (!doc?.storage_path || !doc.encryption_iv) return NextResponse.json({ error: 'Ingen fil lagret' }, { status: 404 });

  const { data: blob, error } = await createAdminClient().storage.from('documents').download(doc.storage_path);
  if (error || !blob) return NextResponse.json({ error: 'Fant ikke filen' }, { status: 404 });
  const plain = decrypt(Buffer.from(await blob.arrayBuffer()), doc.encryption_iv);
  const ext = doc.mime_type === 'application/pdf' ? 'pdf' : doc.mime_type === 'image/png' ? 'png' : 'jpg';
  return new NextResponse(new Uint8Array(plain), {
    headers: {
      'Content-Type': doc.mime_type ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.document_type}-${doc.date}.${ext}"`,
      'Cache-Control': 'no-store, private',
    },
  });
}
