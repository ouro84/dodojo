import Link from "next/link";

export default function QgPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h1 className="font-display text-lg uppercase tracking-wide text-ink">
        Le QG
      </h1>
      <p className="max-w-[32ch] text-sm text-muted">
        Le QG du Héros arrive bientôt — profil, titres et Panthéon.
      </p>
      <Link
        href="/"
        className="text-sm text-xp underline underline-offset-4"
      >
        Retour à l&apos;Arène
      </Link>
    </main>
  );
}
