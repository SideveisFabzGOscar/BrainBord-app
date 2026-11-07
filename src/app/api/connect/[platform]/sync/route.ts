import { NextResponse } from 'next/server';
import { currentUserId, makeDeps } from '@/connections/server';
import { getProvider, syncConnection } from '@/connections/service';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Enkel begrensning per bruker og tjeneste (per serverinstans) for å skåne leverandørens API
const last = new Map<string, number>();

export async function POST(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const mod = getProvider(platform);
  if (!mod) return NextResponse.json({ error: 'Ukjent tjeneste' }, { status: 404 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  const k = `${userId}|${platform}`;
  if (Date.now() - (last.get(k) ?? 0) < 30_000) return NextResponse.json({ error: 'Vent litt før du synkroniserer igjen.' }, { status: 429 });
  last.set(k, Date.now());
  const r = await syncConnection(makeDeps(), mod, userId);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
