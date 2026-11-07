import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Supabase-klient bundet til innlogget bruker. ALLE spørringer går gjennom RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* kalt fra Server Component – middleware oppdaterer sesjonen */ }
        },
      },
    },
  );
}
