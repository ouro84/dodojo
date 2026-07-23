import type { AggressivityLevel } from "../../types";

export function technicalErrorLine(level: AggressivityLevel): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: "Le dojo est injoignable pour l'instant. Respire, réessaie dans un instant.",
    sparring: "Connexion coupée avec le dojo. Impossible de récupérer ton combat.",
    street: "Putain, connexion coupée avec le dojo. Impossible de choper ton combat.",
  };
  return lines[level];
}
