import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function emptyStateTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    sensei: "Le dojo est calme.",
    sparring: "Terrain vague.",
    street: "Tu glandes ou quoi ?",
  };
  return titles[level];
}

export function emptyStateBody(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    sensei: [
      "Aucune bataille à livrer pour l'instant. Le silence est aussi un entraînement.",
      "Rien ne presse. Profite de cet instant sans combat.",
      "Le dojo respire. Reviens quand une cible se présentera.",
      "Pas d'adversaire aujourd'hui — ce n'est pas rien de s'arrêter.",
      "L'esprit vide précède l'action juste. Prends ton temps.",
    ],
    sparring: [
      "Aucun monstre à l'horizon. La rue est calme… trop calme.",
      "Pas d'adversaire en vue ? Ajoute un boss à tomber.",
      "Le compteur est à zéro. À toi de le faire grimper.",
      "Rien à se mettre sous la dent. Balance une tâche.",
      "Le Boss n'a pas encore pointé le bout de son nez.",
    ],
    street: [
      "Balance tes tâches qu'on les défonce. Y'a rien à taper là.",
      "Sérieux, l'appli tourne dans le vide. Remplis quelque chose.",
      "Zéro monstre, zéro excuse. Ajoute un truc avant que je m'endorme.",
      "Même cet écran vide s'ennuie plus vite que toi.",
      "Le néant total. Même le dev qui a codé cet écran attendait mieux de toi.",
    ],
  };
  return pickVariant(pools[level], seed);
}

export function levelUpTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    sensei: "Palier franchi.",
    sparring: "Level Up !",
    street: "LEVEL UP, YEAH !",
  };
  return titles[level];
}

export function levelUpBody(
  level: AggressivityLevel,
  newLevel: number,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, Array<(n: number) => string>> = {
    sensei: [
      (n) => `Niveau ${n}. Une leçon de plus, assimilée en silence.`,
      (n) => `Niveau ${n}. Le chemin s'allonge, l'esprit s'affine.`,
      (n) => `Niveau ${n} atteint. Rien à célébrer bruyamment, tout à retenir.`,
      (n) => `Niveau ${n}. Chaque palier est une répétition de plus.`,
      (n) => `Niveau ${n}. Le dojo ne dit rien, il observe.`,
    ],
    sparring: [
      (n) => `Niveau ${n}. Le dojo t'a appris quelque chose de plus.`,
      (n) => `Niveau ${n} ! Tu progresses, continue comme ça.`,
      (n) => `Niveau ${n}. Un cran au-dessus, mérité.`,
      (n) => `Niveau ${n} débloqué. La suite s'annonce plus corsée.`,
      (n) => `Niveau ${n}. Le dojo prend des notes sur toi.`,
    ],
    street: [
      (n) => `Niveau ${n}, putain ! Tu montes en grade, machine.`,
      (n) => `Niveau ${n} ! Même le générateur de niveaux est impressionné.`,
      (n) => `Ding ! Niveau ${n}. Ouais, comme dans un vrai jeu vidéo.`,
      (n) => `Niveau ${n}, bordel ! T'écris un patch note à toi tout seul.`,
      (n) => `Niveau ${n} ! Le compteur XP a fumé un peu, mais il tient.`,
    ],
  };
  return pickVariant(pools[level], seed)(newLevel);
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

export function koLine(
  level: AggressivityLevel,
  args: KoLineArgs,
  seed: number = randomSeed(),
): string {
  const { isPerfect, firstVictory, username, bossName } = args;

  if (firstVictory) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      sensei: [
        (u, b) => `Premier combat mené à son terme, ${u}. ${b} s'incline. Bienvenue dans l'Arène.`,
        (u, b) => `Premier pas dans l'Arène, ${u}. ${b} s'efface devant ta constance.`,
        (u, b) => `${b} recule. Un début discret, ${u}, mais un début.`,
        (u, b) => `Ton premier combat s'achève, ${u}. ${b} s'incline, sans éclat inutile.`,
        (u, b) => `${u}, ${b} cède. La suite s'écrit maintenant, pas à pas.`,
      ],
      sparring: [
        (u, b) => `Premier sang, ${u} ! ${b} est au tapis. Bienvenue dans l'Arène.`,
        (u, b) => `${u}, ton premier K.O. ! ${b} ne s'y attendait pas.`,
        (u, b) => `Et de un ! ${b} tombe, ${u} entre dans l'Arène en fanfare.`,
        (u, b) => `Premier combat, premier K.O., ${u}. ${b} s'en souviendra.`,
        (u, b) => `${b} au tapis dès le premier round, ${u}. Beau début.`,
      ],
      street: [
        (u, b) => `Premier sang, ${u} ! ${b} est en miettes, putain !`,
        (u, b) => `Premier combat, ${u}, et déjà ${b} qui mord la poussière. Respect.`,
        (u, b) => `${b} explose direct, ${u}. Même le tutoriel a l'air surpris.`,
        (u, b) => `Ça c'est une entrée fracassante, ${u} ! ${b} n'a rien vu venir.`,
        (u, b) => `Premier K.O. de ta carrière, ${u}, et ${b} en paie le prix. Bienvenue dans la rue.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  if (isPerfect) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      sensei: [
        (u, b) => `Pas une égratignure, ${u}. L'esprit clair suffit à faire tomber ${b}.`,
        (u, b) => `${b} tombe sans qu'un coup ne t'atteigne, ${u}. La maîtrise, sans bruit.`,
        (u, b) => `${u}, aucune marque sur toi. ${b} n'a trouvé aucune ouverture.`,
        (u, b) => `Combat clos sans une entaille, ${u}. ${b} salue la discipline.`,
        (u, b) => `${b} s'incline, ${u} intact. La constance a payé.`,
      ],
      sparring: [
        (u, b) => `Pas une égratignure, ${u}. ${b} est au tapis.`,
        (u, b) => `${u}, tu ressors intact. ${b} n'a jamais pu te toucher.`,
        (u, b) => `Perfect, ${u} ! ${b} tombe sans avoir marqué un point.`,
        (u, b) => `${b} au tapis, et toi sans une égratignure, ${u}. Propre.`,
        (u, b) => `${u}, zéro dégât encaissé. ${b} n'a rien vu venir.`,
      ],
      street: [
        (u, b) => `Pas une seule égratignure, ${u}. ${b} s'est fait démonter.`,
        (u, b) => `${u}, t'as même pas transpiré. ${b} est en pièces détachées.`,
        (u, b) => `Perfect, putain ! ${b} explose et toi t'es toujours nickel, ${u}.`,
        (u, b) => `${b} n'a pas pu poser un doigt sur toi, ${u}. C'est presque triste pour lui.`,
        (u, b) => `Zéro dégât, ${u}. ${b} raconte déjà des excuses à qui veut l'entendre.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
    sensei: [
      (u, b) => `${b} est tombé. Le chemin compte plus que la marque laissée, ${u}.`,
      (u, b) => `${b} cède, ${u}. Les marques s'effaceront, la victoire reste.`,
      (u, b) => `${u}, ${b} est vaincu. Les coups reçus font partie du chemin.`,
      (u, b) => `${b} plie. Tu portes quelques marques, ${u}, elles ne pèsent rien face à la victoire.`,
      (u, b) => `${u}, tu l'as emporté sur ${b}. Le prix payé n'efface pas le résultat.`,
    ],
    sparring: [
      (u, b) => `${b} a mordu la poussière. Tu l'as eu, ${u}.`,
      (u, b) => `${b} tombe, ${u}. T'as encaissé, mais tu l'as eu.`,
      (u, b) => `Ça a chauffé, mais ${b} est à terre, ${u}.`,
      (u, b) => `${u}, ${b} est K.O. T'y es allé, ça s'est vu.`,
      (u, b) => `${b} plie sous les coups, ${u}. Victoire méritée, marquée.`,
    ],
    street: [
      (u, b) => `${b} a mangé le trottoir. Tu l'as buté, ${u}.`,
      (u, b) => `${b} est au sol, ${u}. T'as pris cher mais t'as gagné, merde.`,
      (u, b) => `K.O., ${u} ! ${b} valait pas le coup de se ménager visiblement.`,
      (u, b) => `${b} mordu, ${u} cabossé. Résultat : victoire quand même, putain.`,
      (u, b) => `${u}, tu ressors amoché mais ${b} ressort en miettes. Bon deal.`,
    ],
  };
  return pickVariant(pools[level], seed)(username, bossName);
}

export function milestoneLine(
  level: AggressivityLevel,
  milestone: number,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, Array<(n: number) => string>> = {
    sensei: [
      (n) => `Série de ${n}. Le dojo retient ce genre de constance.`,
      (n) => `${n} jours de suite. La régularité parle plus fort que l'exploit.`,
      (n) => `Série de ${n}. Rien d'éclatant, juste de la constance qui s'accumule.`,
      (n) => `${n} d'affilée. Le dojo observe, silencieux, mais il observe.`,
      (n) => `Série de ${n}. Ce n'est plus de la chance, c'est une discipline.`,
    ],
    sparring: [
      (n) => `Série de ${n} ! Le dojo se souviendra.`,
      (n) => `${n} d'affilée, beau palier !`,
      (n) => `Série de ${n} ! Ça commence à ressembler à une habitude solide.`,
      (n) => `${n} victoires de suite. Le Boss doit s'en inquiéter.`,
      (n) => `Série de ${n} ! Tu tiens la cadence.`,
    ],
    street: [
      (n) => `Série de ${n}, putain ! Le dojo va en parler pendant des semaines.`,
      (n) => `${n} d'affilée ! Même le compteur de série a l'air fatigué de compter.`,
      (n) => `Série de ${n}, bordel ! T'es en train de casser les stats du jeu.`,
      (n) => `${n} de suite. Le Boss commence à te connaître par ton prénom.`,
      (n) => `Série de ${n}, merde ! Ça mérite un vrai badge, pas juste des flammes.`,
    ],
  };
  return pickVariant(pools[level], seed)(milestone);
}
