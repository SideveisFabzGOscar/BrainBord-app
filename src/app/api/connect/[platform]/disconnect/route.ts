import { NextResponse } from 'next/server';
import { currentUserId, makeDeps } from '@/connections/server';
import { disconnect, getProvider } from '@/connections/service';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const mod = getProvider(platform);
  if (!mod) return NextResponse.json({ error: 'Ukjent tjeneste' }, { status: 404 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  await disconnect(makeDeps(), mod, userId);
  return NextResponse.json({ ok: true });
}
