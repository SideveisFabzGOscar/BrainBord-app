export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Laster">
      <div className="h-7 w-48 rounded-lg bg-ink/10" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-ink/[.06]" />)}
      </div>
      <div className="h-80 rounded-xl bg-ink/[.06]" />
    </div>
  );
}
