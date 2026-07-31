export default function AchievementsLoading() {
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <div className="skeleton h-6 w-32 self-center rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-32 w-full rounded-lg" />
      ))}
    </main>
  );
}
