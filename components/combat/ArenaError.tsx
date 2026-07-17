import Link from "next/link";

export default function ArenaError() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div
        role="alert"
        className="w-full max-w-xs rounded-md border border-alert bg-surface px-3 py-2 text-sm text-alert"
      >
        Connexion coupée avec le dojo. Impossible de récupérer ton combat.
      </div>
      <Link
        href="/"
        className="rounded-md bg-alert px-4 py-2 font-display text-xs uppercase tracking-wide text-[oklch(0.15_0.02_55)]"
      >
        Réessayer
      </Link>
    </div>
  );
}
