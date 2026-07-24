// Audit #67, PR6 (règle projet n°3) — squelette cohérent avec pantheon/loading.tsx.
export default function QgLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8"
    >
      <div className="skeleton mx-auto h-6 w-24 rounded" />
      <div className="flex flex-col items-center gap-4">
        <div className="skeleton h-16 w-full rounded-lg" />
      </div>
      <div className="skeleton h-32 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-12 w-full rounded-md" />
        ))}
      </div>
    </main>
  );
}
