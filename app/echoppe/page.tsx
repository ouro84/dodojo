import Link from "next/link";

export default function EchoppePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h1 className="font-display text-lg uppercase tracking-wide text-gold">
        L&apos;Échoppe
      </h1>
      <p className="max-w-[32ch] text-sm text-muted">
        Les skins de Boss arrivent bientôt — reviens quand tes poches
        seront pleines d&apos;or.
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
