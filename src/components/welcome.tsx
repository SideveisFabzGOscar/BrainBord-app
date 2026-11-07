'use client';

import { useEffect, useState } from 'react';

export const WELCOME_KEY = 'brainbord_welcome';

/** «Hei <fornavn>» med hvitt smilefjes i 3 sekunder rett etter innlogging */
export function Welcome({ firstName }: { firstName: string }) {
  const [phase, setPhase] = useState<'off' | 'on' | 'fade'>('off');
  useEffect(() => {
    let show = false;
    try { show = sessionStorage.getItem(WELCOME_KEY) === '1'; sessionStorage.removeItem(WELCOME_KEY); } catch { /* privat modus */ }
    if (!show) return;
    setPhase('on');
    const a = setTimeout(() => setPhase('fade'), 3000);
    const b = setTimeout(() => setPhase('off'), 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (phase === 'off') return null;
  return (
    <div role="status" className={`fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-accent p-6 text-white transition-opacity duration-500 ${phase === 'fade' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <svg viewBox="0 0 24 24" className="h-auto w-[min(42vw,220px)] animate-fade-in" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="none" stroke="#fff" strokeWidth="1.6" />
        <circle cx="8.6" cy="9.5" r="1.4" fill="#fff" /><circle cx="15.4" cy="9.5" r="1.4" fill="#fff" />
        <path d="M6 13.5c1.6 3 3.6 4.4 6 4.4s4.4-1.4 6-4.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <h1 className="text-6xl font-bold tracking-tight sm:text-8xl">Hei {firstName}</h1>
    </div>
  );
}
