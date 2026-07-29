// Audit #67, PR6 (règle projet n°3).
export default function GuideLoading() {
  return (
    <main
      aria-busy="true"
      className="screen-main gap-6 px-4 py-6"
    >
      <div className="skeleton mx-auto h-6 w-40 rounded" />
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="flex flex-col gap-2">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-10 w-full rounded-md" />
          <div className="skeleton h-10 w-full rounded-md" />
        </div>
      ))}
    </main>
  );
}
