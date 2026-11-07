'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Kind = 'elev' | 'laerer';
/** To innloggingsvalg. Elev: elev (og foresatt). Lærer: lærer (og skoleadministrator). */
const KINDS: { kind: Kind; label: string; desc: string; roles: string[] }[] = [
  { kind: 'elev', label: 'Elev', desc: 'Egne oppgaver, prøver, plan og fravær', roles: ['student', 'parent'] },
  { kind: 'laerer', label: 'Lærer', desc: 'Klassene og fagene dine', roles: ['teacher', 'admin'] },
];
const TEST_USERS: Record<Kind, string> = { elev: 'elev@skolehub.test', laerer: 'laerer.matte@skolehub.test' };
const IS_DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<Kind>('elev');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) { setLoading(false); return setError('Feil e-post eller passord.'); }
    // Kontroller at kontoen passer med valget (rollen bestemmes av skolen, ikke av valget)
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
    const chosen = KINDS.find((k) => k.kind === kind)!;
    if (!profile || !chosen.roles.includes(profile.role)) {
      await supabase.auth.signOut();
      setLoading(false);
      return setError(kind === 'laerer' ? 'Dette er ikke en lærerkonto. Velg «Elev».' : 'Dette er en lærerkonto. Velg «Lærer».');
    }
    setLoading(false);
    try { sessionStorage.setItem('brainbord_welcome', '1'); } catch { /* privat modus */ }
    router.replace(kind === 'laerer' ? '/classflow' : '/samlet');
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      {/* Øverst til venstre: navnet og «Logg inn» */}
      <header className="flex h-16 items-center gap-4 border-b border-line px-4 lg:px-8">
        <span className="text-2xl font-bold tracking-tight">Brain<span className="text-accent">Bord</span></span>
        <button type="button" className="btn-primary px-3 py-1.5" onClick={() => document.getElementById('email')?.focus()}>Logg inn</button>
      </header>
    <main className="grid place-items-center p-4 py-10">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-white"><GraduationCap size={30} /></div>
          <h1 className="text-4xl font-bold tracking-tight">Brain<span className="text-accent">Bord</span></h1>
          <p className="mt-2 text-sm text-muted"><b className="text-ink">Denne siden heter BrainBord.</b> All skoleinformasjon fra Canvas, Teams og iSkole på ett sted.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="text-lg font-semibold">Logg inn</h2>
          <div role="radiogroup" aria-label="Logg inn som" className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} onClick={() => { setKind(k.kind); setError(null); }}
                className={kind === k.kind ? 'rounded-xl border-2 border-accent bg-accent/10 p-3 text-left' : 'rounded-xl border-2 border-line p-3 text-left transition hover:bg-ink/5 hover:shadow-lift'}>
                <span className="block font-semibold">{k.label}</span>
                <span className="block text-[11px] leading-snug text-muted">{k.desc}</span>
              </button>
            ))}
          </div>
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
            {loading && <Loader2 size={16} className="animate-spin" />} Logg inn som {kind === 'elev' ? 'elev' : 'lærer'}
          </button>
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Kontoer opprettes av skolen. Foresatte velger «Elev», skoleadministratorer «Lærer». I produksjon anbefales Feide-innlogging.
          </p>
        </form>
        {IS_DEV && (
          <div className="mt-4 rounded-xl border border-dashed border-line p-4">
            <div className="mb-2 text-xs font-medium text-muted">Testbrukere (syntetiske data, passord Brainbord!2026)</div>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button key={k.kind} type="button" className="btn-outline px-2.5 py-1 text-xs"
                  onClick={() => { setKind(k.kind); setEmail(TEST_USERS[k.kind]); setPassword('Brainbord!2026'); }}>{k.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}
