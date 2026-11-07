'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="font-semibold">Noe gikk galt</h2>
      <p className="mt-2 text-sm text-muted">Siden kunne ikke lastes. Prøv igjen, eller kontakt skolen hvis feilen vedvarer.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Feilkode: {error.digest}</p>}
      <button className="btn-primary mt-4" onClick={reset}>Prøv igjen</button>
    </div>
  );
}
