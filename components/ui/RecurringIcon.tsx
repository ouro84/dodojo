// Issue #183 : remplace l'emoji 🔁 (hors design system — DESIGN.md n'a
// qu'un seul précédent d'icône, MicButton.tsx, un SVG 16x16 dessiné à la
// main). Trait plutôt que fill (contrairement à MicButton) : un pictogramme
// de cycle/boucle se lit mieux en contour qu'en silhouette pleine.
export default function RecurringIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 8a6 6 0 0 1 6-6 6.5 6.5 0 0 1 4.5 1.8L14 5" />
      <path d="M14 2v3h-3" />
      <path d="M14 8a6 6 0 0 1-6 6 6.5 6.5 0 0 1-4.5-1.8L2 11" />
      <path d="M2 14v-3h3" />
    </svg>
  );
}
