// Audit #67, PR6 (règle projet n°3).
export default function EntrainementLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6"
    >
      <div className="skeleton mx-auto h-6 w-48 rounded" />
      <div className="skeleton h-40 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
