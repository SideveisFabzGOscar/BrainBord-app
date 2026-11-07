import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div><div className="text-5xl font-semibold text-muted">404</div><p className="mt-2">Fant ikke siden.</p>
        <Link className="btn-primary mt-4" href="/dashboard">Til dashboard</Link></div>
    </main>
  );
}
