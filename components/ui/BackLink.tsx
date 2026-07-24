import Link from "next/link";

interface BackLinkProps {
  href: string;
  label: string;
}

// Audit UX 2026-07-24 (P0) : seul composant de retour restant dans l'app.
// Une fois BottomNav monté partout, "Retour au QG"/"Retour à l'Arène" devient
// redondant avec l'onglet QG/Arène — BackLink ne sert plus qu'à remonter d'un
// niveau à l'intérieur d'un sous-flux non couvert par un onglet (ex. Guide
// article -> Sommaire du Guide).
export default function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 self-start text-xs text-muted hover:text-ink"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
