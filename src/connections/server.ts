import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { SupabaseConnectionStore } from './supabase-store';
import type { Deps } from './service';
import type { ConnPlatform } from './types';

export function appUrl() {
  const u = process.env.APP_URL ?? 'http://localhost:3000';
  return u.replace(/\/$/, '');
}

export function makeDeps(): Deps {
  return {
    ctx: { env: process.env as Record<string, string | undefined>, fetch, now: Date.now },
    store: new SupabaseConnectionStore(createAdminClient()),
    redirectUri: (p: ConnPlatform) => `${appUrl()}/api/connect/${p}/callback`,
  };
}

/** Innlogget bruker (verifisert mot Supabase Auth, ikke bare cookie) */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
