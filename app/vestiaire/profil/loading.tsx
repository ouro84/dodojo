// Issue #69 : état de chargement (règle projet n°3) — squelettes des 7 blocs.
export default function ProfilLoading() {
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <div className="skeleton h-6 w-40 self-center rounded" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="skeleton h-24 w-full rounded-lg" />
      ))}
    </main>
  );
}
