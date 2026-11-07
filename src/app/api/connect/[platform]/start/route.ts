import { NextResponse } from 'next/server';
import { appUrl, currentUserId } from '@/connections/server';
import { getProvider } from '@/connections/service';
import { ERROR_TEXT } from '@/connections/types';
import { createOAuthState, STATE_COOKIE } from '@/connections/vault';

export const runtime = 'nodejs';

/** Steg 1: send brukeren til tjenestens egen innloggingsside (OAuth 2.0). */
export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const mod = getProvider(platform);
  const back = (q: string) => NextResponse.redirect(`${appUrl()}/integrasjoner?${q}`, { status: 303 });
  if (!mod) return back('feil=ukjent');
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(`${appUrl()}/login`, { status: 303 });

  const cfg = mod.configured(process.env as Record<string, string | undefined>);
  if (!cfg.ok) return back(`tjeneste=${platform}&feil=${encodeURIComponent(ERROR_TEXT[cfg.reason ?? 'NOT_CONFIGURED'])}`);

  const { cookieValue, state, challenge } = createOAuthState(mod.platform, userId, process.env.TOKEN_ENCRYPTION_KEY);
  const url = mod.authorizeUrl({ env: process.env as Record<string, string | undefined>, fetch, now: Date.now },
    { state, codeChallenge: challenge, redirectUri: `${appUrl()}/api/connect/${platform}/callback` });
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(STATE_COOKIE, cookieValue, {
    httpOnly: true, secure: appUrl().startsWith('https://'), sameSite: 'lax', path: `/api/connect/${platform}`, maxAge: 600,
  });
  return res;
}
