import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function technicalErrorLine(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Dodojo est injoignable pour l'instant. Respire, réessaie dans un instant.",
      "La connexion s'est interrompue. Rien de grave, un instant suffira.",
      "Dodojo ne répond pas là, maintenant. Cela passera.",
      "Un silence technique, temporaire. Réessaie dans un moment.",
      "Le lien est coupé pour l'instant. Patiente, puis retente.",
    ],
    direct: [
      "Connexion coupée avec Dodojo. Impossible de récupérer ton combat.",
      "Dodojo ne répond plus. Réessaie dans un instant.",
      "Coupure de connexion. Ton combat n'a pas pu être chargé.",
      "Le serveur de Dodojo a toussé. Retente dans un moment.",
      "Liaison perdue avec Dodojo. Un nouvel essai devrait suffire.",
    ],
    brut: [
      "Putain, connexion coupée avec Dodojo. Impossible de choper ton combat. C'est vraiment codé avec les pieds !",
      "Bordel, Dodojo répond plus. Réessaie, merde.",
      "Connexion foutue, le combat a pas chargé. Ça arrive même aux meilleurs, putain.",
      "Le serveur a lâché comme une merde. Retente dans un instant.",
      "Coupure de ouf avec Dodojo. Même le wifi se met en rage quit, bordel.",
    ],
  };
  return pickVariant(pools[level], seed);
}
