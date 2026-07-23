import type { AggressivityLevel } from "../../types";

export function emptyStateTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    sensei: "Le dojo est calme.",
    sparring: "Terrain vague.",
    street: "Tu glandes ou quoi ?",
  };
  return titles[level];
}

export function emptyStateBody(level: AggressivityLevel): string {
  const bodies: Record<AggressivityLevel, string> = {
    sensei: "Aucune bataille à livrer pour l'instant. Le silence est aussi un entraînement.",
    sparring: "Aucun monstre à l'horizon. La rue est calme… trop calme.",
    street: "Balance tes tâches qu'on les défonce. Y'a rien à taper là.",
  };
  return bodies[level];
}

export function levelUpTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    sensei: "Palier franchi.",
    sparring: "Level Up !",
    street: "LEVEL UP, putain !",
  };
  return titles[level];
}

export function levelUpBody(level: AggressivityLevel, newLevel: number): string {
  const bodies: Record<AggressivityLevel, string> = {
    sensei: `Niveau ${newLevel}. Une leçon de plus, assimilée en silence.`,
    sparring: `Niveau ${newLevel}. Le dojo t'a appris quelque chose de plus.`,
    street: `Niveau ${newLevel}, putain ! Tu montes en grade, machine.`,
  };
  return bodies[level];
}

export function koHeader(level: AggressivityLevel, isPerfect: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    sensei: ["Perfect.", "K.O."],
    sparring: ["Perfect !", "K.O. !"],
    street: ["PERFECT !", "K.O. !!"],
  };
  const [perfect, ko] = headers[level];
  return isPerfect ? perfect : ko;
}

interface KoLineArgs {
  isPerfect: boolean;
  firstVictory: boolean;
  username: string;
  bossName: string;
}

export function koLine(level: AggressivityLevel, args: KoLineArgs): string {
  const { isPerfect, firstVictory, username, bossName } = args;

  if (firstVictory) {
    const lines: Record<AggressivityLevel, string> = {
      sensei: `Premier combat mené à son terme, ${username}. ${bossName} s'incline. Bienvenue dans l'Arène.`,
      sparring: `Premier sang, ${username} ! ${bossName} est au tapis. Bienvenue dans l'Arène.`,
      street: `Premier sang, ${username} ! ${bossName} est en miettes, putain. Bienvenue dans la rue.`,
    };
    return lines[level];
  }

  if (isPerfect) {
    const lines: Record<AggressivityLevel, string> = {
      sensei: `Pas une égratignure, ${username}. L'esprit clair suffit à faire tomber ${bossName}.`,
      sparring: `Sans une égratignure, ${username}. ${bossName} est au tapis.`,
      street: `Sans une seule égratignure, ${username}. ${bossName} s'est fait démonter, bordel.`,
    };
    return lines[level];
  }

  const lines: Record<AggressivityLevel, string> = {
    sensei: `${bossName} est tombé. Le chemin compte plus que la marque laissée, ${username}.`,
    sparring: `${bossName} a mordu la poussière. Tu l'as eu, ${username}.`,
    street: `${bossName} a mangé le trottoir. Tu l'as buté, ${username}.`,
  };
  return lines[level];
}

export function milestoneLine(level: AggressivityLevel, milestone: number): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: `Série de ${milestone}. Le dojo retient ce genre de constance.`,
    sparring: `Série de ${milestone} ! Le dojo se souviendra.`,
    street: `Série de ${milestone}, putain ! Le dojo va en parler pendant des semaines.`,
  };
  return lines[level];
}
