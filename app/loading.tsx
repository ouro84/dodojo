export default function ArenaLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4" aria-busy="true">
      <div className="flex items-center justify-between">
        <span className="skeleton h-4 w-32" />
        <span className="skeleton h-4 w-16" />
      </div>
      <span className="skeleton h-3.5 w-full" />
      <span className="skeleton h-40 w-full rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="skeleton h-9 w-full rounded-md" />
        <span className="skeleton h-9 w-full rounded-md" />
        <span className="skeleton ml-6 h-9 w-[calc(100%-1.5rem)] rounded-md" />
        <span className="skeleton h-9 w-full rounded-md" />
      </div>
      <span className="skeleton h-10 w-full rounded-md" />
      <div className="mt-auto flex justify-around border-t border-border pt-2.5">
        <span className="skeleton h-3 w-10 rounded" />
        <span className="skeleton h-3 w-10 rounded" />
        <span className="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  );
}
