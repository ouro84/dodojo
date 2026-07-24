export const metadata = { title: "Hors ligne — Dodojo" };

// Fallback léger servi par le service worker (app/sw.ts) quand une
// navigation échoue réellement hors-ligne. L'app reste server-driven
// (Supabase) : pas de logique de jeu offline, juste un écran cohérent avec
// le ton du jeu plutôt que l'erreur générique du navigateur.
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h1 className="font-display text-lg uppercase tracking-wide text-ink">
        Dodojo est hors ligne
      </h1>
      <p className="max-w-xs text-sm text-muted">
        Pas de réseau, pas de combat. Reconnecte-toi pour retrouver ton Boss du jour.
      </p>
    </main>
  );
}
