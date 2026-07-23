import type { AggressivityLevel } from "../../types";

export function wakeUpSubtitle(level: AggressivityLevel): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: "Les tâches d'hier attendent encore une réponse. Prends un instant, règle-les avant d'avancer.",
    sparring: "Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d'entrer dans l'Arène.",
    street: "Tes monstres d'hier sont pas partis, ils t'ont attendu. Nettoie ce bordel avant d'entrer.",
  };
  return lines[level];
}

export function crepusculeHeader(level: AggressivityLevel, victory: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    sensei: ["Journée accomplie.", "Crépuscule."],
    sparring: ["Perfect !", "Crépuscule"],
    street: ["NETTOYÉ !", "Crépuscule."],
  };
  const [victoryHeader, retreatHeader] = headers[level];
  return victory ? victoryHeader : retreatHeader;
}

interface CrepusculeLineArgs {
  victory: boolean;
  username: string;
  bossName: string;
}

export function crepusculeLine(level: AggressivityLevel, args: CrepusculeLineArgs): string {
  const { victory, username, bossName } = args;

  if (victory) {
    const lines: Record<AggressivityLevel, string> = {
      sensei: `${username}, ${bossName} s'est incliné. Repose-toi, la rue attendra ta prochaine sortie.`,
      sparring: `${username}, tu as terrassé ${bossName}. La rue est calme pour ce soir.`,
      street: `${username}, ${bossName} est au tapis, putain. La rue te doit le respect ce soir.`,
    };
    return lines[level];
  }

  const lines: Record<AggressivityLevel, string> = {
    sensei: `${username}, tu poses les armes pour ce soir. Aucune honte à ça — demain reste un autre combat.`,
    sparring: `${username}, tu poses les armes. Pas de honte — demain est un autre combat.`,
    street: `${username}, tu esquives ce soir ? D'accord. Mais ce combat t'attend au tournant, demain.`,
  };
  return lines[level];
}
