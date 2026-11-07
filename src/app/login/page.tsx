'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TEST_USERS = [
  { label: 'Elev', email: 'elev@skolehub.test' },
  { label: 'Lærer', email: 'laerer.matte@skolehub.test' },
  { label: 'Admin', email: 'admin@skolehub.test' },
  { label: 'Foresatt', email: 'forelder@skolehub.test' },
];
const IS_DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError('Feil e-post eller passord.');
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white"><GraduationCap size={20} /></div>
          <div>
            <div className="font-semibold tracking-tight">SkoleHub</div>
            <div className="text-xs text-muted">All skoleinformasjon på ett sted</div>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h1 className="text-lg font-semibold">Logg inn</h1>
          <div>
            <label className="label" htmlFor="email">E-post</label>
            <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pw">Passord</label>
            <input id="pw" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading && <Loader2 size={16} className="animate-spin" />} Logg inn
          </button>
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Kontoer opprettes av skolen. I produksjon anbefales Feide-innlogging (SAML/OIDC via Supabase Auth).
          </p>
        </form>
        {IS_DEV && (
          <div className="mt-4 rounded-xl border border-dashed border-line p-4">
            <div className="mb-2 text-xs font-medium text-muted">Testbrukere (syntetiske data, passord SkoleHub!2026)</div>
            <div className="flex flex-wrap gap-2">
              {TEST_USERS.map((u) => (
                <button key={u.email} type="button" className="btn-outline px-2.5 py-1 text-xs"
                  onClick={() => { setEmail(u.email); setPassword('SkoleHub!2026'); }}>{u.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
