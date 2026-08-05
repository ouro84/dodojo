import Link from "next/link";
import { ALL_ACHIEVEMENT_DEFS } from "@/lib/achievements";

interface EquippedTitlePreviewProps {
  titleCode: string | null;
}

// Issue #69 : aperçu lecture seule du titre équipé (affiché à côté du pseudo
// dans l'Arène, cf. VersusScene). Le vrai picker (radiogroup, issue #153)
// reste exclusivement sur /tableau-de-chasse/succes — il a besoin du
// catalogue complet des succès (mystère/progression, raretés), qu'on ne
// duplique pas ici. Composant pur, pas de "use client" nécessaire.
export default function EquippedTitlePreview({ titleCode }: EquippedTitlePreviewProps) {
  const label = titleCode
    ? (ALL_ACHIEVEMENT_DEFS.find((def) => def.code === titleCode)?.title ?? null)
    : null;

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-ink">
      <span>Titre : {label ?? "Aucun titre équipé"}</span>
      <Link href="/tableau-de-chasse/succes" className="text-xs text-muted underline underline-offset-4">
        Changer
      </Link>
    </div>
  );
}
