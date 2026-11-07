import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service role-klient: OMGÅR RLS. Brukes kun på serveren etter at
 * tilgang er sjekket med brukerens egen klient (synkronisering, lagring
 * av krypterte filer). Skal aldri importeres i klientkomponenter.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY mangler');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
