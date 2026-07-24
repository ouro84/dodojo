// Audit #67, PR6 (règle projet n°3).
export default function GuideArticleLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6"
    >
      <div className="skeleton h-4 w-16 rounded" />
      <div className="skeleton h-6 w-3/4 rounded" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-4 w-full rounded" />
        ))}
      </div>
    </main>
  );
}
