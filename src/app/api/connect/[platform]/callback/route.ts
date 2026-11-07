import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { appUrl, currentUserId, makeDeps } from '@/connections/server';
import { completeConnection, getProvider } from '@/connections/service';
import { ConnError, ERROR_TEXT } from '@/connections/types';
import { STATE_COOKIE, verifyOAuthState } from '@/connections/vault';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Steg 2: tjenesten sender brukeren tilbake med en engangskode. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const mod = getProvider(platform);
  const back = (q: string) => {
    const res = NextResponse.redirect(`${appUrl()}/integrasjoner?tjeneste=${platform}&${q}`, { status: 303 });
    res.cookies.set(STATE_COOKIE, '', { path: `/api/connect/${platform}`, maxAge: 0 });
    return res;
  };
  if (!mod) return back('feil=ukjent');
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(`${appUrl()}/login`, { status: 303 });

  // Brukeren avslo, eller skolen har ikke gitt samtykke
  const err = url.searchParams.get('error');
  if (err) {
    const desc = url.searchParams.get('error_description') ?? '';
    const code = err === 'access_denied' && !/AADSTS65001|admin/i.test(desc) ? 'ACCESS_DENIED'
      : /consent|AADSTS65001|AADSTS90094/i.test(err + desc) ? 'CONSENT_REQUIRED' : 'UPSTREAM';
    await makeDeps().store.save(userId, mod.platform, { status: 'feilet', lastError: ERROR_TEXT[code], errorCode: code });
    return back(`feil=${encodeURIComponent(ERROR_TEXT[code])}`);
  }

  try {
    const st = verifyOAuthState((await cookies()).get(STATE_COOKIE)?.value, { state: url.searchParams.get('state') },
      { platform: mod.platform, userId }, process.env.TOKEN_ENCRYPTION_KEY);
    const code = url.searchParams.get('code');
    if (!code) throw new ConnError('INVALID_STATE', 'Mangler kode');
    const r = await completeConnection(makeDeps(), mod, userId, code, st.verifier);
    return back(r.ok ? 'tilkoblet=1' : `feil=${encodeURIComponent(r.message ?? 'Tilkobling feilet')}`);
  } catch (e) {
    const code = e instanceof ConnError ? e.code : 'UPSTREAM';
    return back(`feil=${encodeURIComponent(ERROR_TEXT[code])}`);
  }
}
