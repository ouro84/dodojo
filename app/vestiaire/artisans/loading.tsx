export default function Loading() {
  return (
    <main className="screen-main gap-4 px-4 py-6">
      <div className="h-4 w-32 animate-pulse rounded bg-surface" />
      <div className="h-6 w-48 animate-pulse self-center rounded bg-surface" />
      <div className="h-28 w-full animate-pulse rounded bg-surface" />
    </main>
  );
}
