import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function emptyStateTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    doux: "Ta tête est calme.",
    direct: "Terrain vague.",
    brut: "Tu glandes ou quoi ?",
  };
  return titles[level];
}

export function emptyStateBody(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Aucune bataille à livrer pour l'instant. Le silence est aussi un entraînement.",
      "Rien ne presse. Profite de cet instant sans combat.",
      "Ta tête respire. Reviens quand une cible se présentera.",
      "Pas d'adversaire aujourd'hui — ce n'est pas rien de s'arrêter.",
      "L'esprit vide précède l'action juste. Prends ton temps.",
    ],
    direct: [
      "Aucun monstre à l'horizon. Ta tête est calme… trop calme.",
      "Pas d'adversaire en vue ? Ajoute un boss à tomber.",
      "Le compteur est à zéro. À toi de le faire grimper.",
      "Rien à se mettre sous la dent. Balance une tâche.",
      "Le Boss n'a pas encore pointé le bout de son nez.",
    ],
    brut: [
      "Balance tes tâches qu'on les défonce. Y'a rien à taper là.",
      "Sérieux, l'appli tourne dans le vide. Remplis quelque chose.",
      "Zéro monstre, zéro excuse. Ajoute un truc avant que je m'endorme.",
      "Même cet écran vide s'ennuie plus vite que toi.",
      "Le néant total. Même le jeu s'attendait à mieux, putain.",
    ],
  };
  return pickVariant(pools[level], seed);
}

export function levelUpTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    doux: "Palier franchi.",
    direct: "Level Up !",
    brut: "LEVEL UP, YEAH !",
  };
  return titles[level];
}

export function levelUpBody(
  level: AggressivityLevel,
  newLevel: number,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, Array<(n: number) => string>> = {
    doux: [
      (n) => `Niveau ${n}. Une leçon de plus, assimilée en silence.`,
      (n) => `Niveau ${n}. Le chemin s'allonge, l'esprit s'affine.`,
      (n) => `Niveau ${n} atteint. Rien à célébrer bruyamment, tout à retenir.`,
      (n) => `Niveau ${n}. Chaque palier est une répétition de plus.`,
      (n) => `Niveau ${n}. La Voix ne dit rien, elle observe.`,
    ],
    direct: [
      (n) => `Niveau ${n}. Tu en as appris un peu plus sur toi-même.`,
      (n) => `Niveau ${n} ! Tu progresses, continue comme ça.`,
      (n) => `Niveau ${n}. Un cran au-dessus, mérité.`,
      (n) => `Niveau ${n} débloqué. La suite s'annonce plus corsée.`,
      (n) => `Niveau ${n}. La Voix prend des notes sur toi.`,
    ],
    brut: [
      (n) => `Niveau ${n}, putain ! Tu montes en grade, machine.`,
      (n) => `Niveau ${n} ! Même le jeu est impressionné.`,
      (n) => `Ding ! Niveau ${n}. Ouais, comme dans un vrai jeu vidéo.`,
      (n) => `Niveau ${n}, bordel ! T'écris un patch note à toi tout seul.`,
      (n) => `Niveau ${n} ! Le compteur XP a fumé un peu, mais il tient.`,
    ],
  };
  return pickVariant(pools[level], seed)(newLevel);
}

export function koHeader(level: AggressivityLevel, isPerfect: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    doux: ["Perfect.", "K.O."],
    direct: ["Perfect !", "K.O. !"],
    brut: ["PERFECT !", "K.O. !!"],
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
      doux: [
        (u, b) => `Premier combat mené à son terme, ${u}. ${b} s'incline. Bienvenue dans l'Arène.`,
        (u, b) => `Premier pas dans l'Arène, ${u}. ${b} s'efface devant ta constance.`,
        (u, b) => `${b} recule. Un début discret, ${u}, mais un début.`,
        (u, b) => `Ton premier combat s'achève, ${u}. ${b} s'incline, sans éclat inutile.`,
        (u, b) => `${u}, ${b} cède. La suite s'écrit maintenant, pas à pas.`,
      ],
      direct: [
        (u, b) => `Premier sang, ${u} ! ${b} est au tapis. Bienvenue dans l'Arène.`,
        (u, b) => `${u}, ton premier K.O. ! ${b} ne s'y attendait pas.`,
        (u, b) => `Et de un ! ${b} tombe, ${u} entre dans l'Arène en fanfare.`,
        (u, b) => `Premier combat, premier K.O., ${u}. ${b} s'en souviendra.`,
        (u, b) => `${b} au tapis dès le premier round, ${u}. Beau début.`,
      ],
      brut: [
        (u, b) => `Premier sang, ${u} ! ${b} est en miettes, putain !`,
        (u, b) => `Premier combat, ${u}, et déjà ${b} qui mord la poussière. Respect.`,
        (u, b) => `${b} explose direct, ${u}. Même le tutoriel a l'air surpris.`,
        (u, b) => `Ça c'est une entrée fracassante, ${u} ! ${b} n'a rien vu venir.`,
        (u, b) => `Premier K.O. de ta carrière, ${u}, et ${b} en paie le prix. Bienvenue dans l'Arène.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  if (isPerfect) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      doux: [
        (u, b) => `Pas une égratignure, ${u}. L'esprit clair suffit à faire tomber ${b}.`,
        (u, b) => `${b} tombe sans qu'un coup ne t'atteigne, ${u}. La maîtrise, sans bruit.`,
        (u, b) => `${u}, aucune marque sur toi. ${b} n'a trouvé aucune ouverture.`,
        (u, b) => `Combat clos sans une entaille, ${u}. ${b} salue la discipline.`,
        (u, b) => `${b} s'incline, ${u} intact. La constance a payé.`,
      ],
      direct: [
        (u, b) => `Pas une égratignure, ${u}. ${b} est au tapis.`,
        (u, b) => `${u}, tu ressors intact. ${b} n'a jamais pu te toucher.`,
        (u, b) => `Perfect, ${u} ! ${b} tombe sans avoir marqué un point.`,
        (u, b) => `${b} au tapis, et toi sans une égratignure, ${u}. Propre.`,
        (u, b) => `${u}, zéro dégât encaissé. ${b} n'a rien vu venir.`,
      ],
      brut: [
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
    doux: [
      (u, b) => `${b} est tombé. Le chemin compte plus que la marque laissée, ${u}.`,
      (u, b) => `${b} cède, ${u}. Les marques s'effaceront, la victoire reste.`,
      (u, b) => `${u}, ${b} est vaincu. Les coups reçus font partie du chemin.`,
      (u, b) => `${b} plie. Tu portes quelques marques, ${u}, elles ne pèsent rien face à la victoire.`,
      (u, b) => `${u}, tu l'as emporté sur ${b}. Le prix payé n'efface pas le résultat.`,
    ],
    direct: [
      (u, b) => `${b} a mordu la poussière. Tu l'as eu, ${u}.`,
      (u, b) => `${b} tombe, ${u}. T'as encaissé, mais tu l'as eu.`,
      (u, b) => `Ça a chauffé, mais ${b} est à terre, ${u}.`,
      (u, b) => `${u}, ${b} est K.O. T'y es allé, ça s'est vu.`,
      (u, b) => `${b} plie sous les coups, ${u}. Victoire méritée, marquée.`,
    ],
    brut: [
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
    doux: [
      (n) => `Série de ${n}. La Voix retient ce genre de constance.`,
      (n) => `${n} jours de suite. La régularité parle plus fort que l'exploit.`,
      (n) => `Série de ${n}. Rien d'éclatant, juste de la constance qui s'accumule.`,
      (n) => `${n} d'affilée. La Voix observe, silencieuse, mais elle observe.`,
      (n) => `Série de ${n}. Ce n'est plus de la chance, c'est une discipline.`,
    ],
    direct: [
      (n) => `Série de ${n} ! Ça va laisser une trace.`,
      (n) => `${n} d'affilée, beau palier !`,
      (n) => `Série de ${n} ! Ça commence à ressembler à une habitude solide.`,
      (n) => `${n} victoires de suite. Le Boss doit s'en inquiéter.`,
      (n) => `Série de ${n} ! Tu tiens la cadence.`,
    ],
    brut: [
      (n) => `Série de ${n}, putain ! On va en parler pendant des semaines.`,
      (n) => `${n} d'affilée ! Même le compteur de série a l'air fatigué de compter.`,
      (n) => `Série de ${n}, bordel ! T'es en train de casser les stats du jeu.`,
      (n) => `${n} de suite. Le Boss commence à te connaître par ton prénom.`,
      (n) => `Série de ${n}, merde ! Ça mérite un vrai badge, pas juste des flammes.`,
    ],
  };
  return pickVariant(pools[level], seed)(milestone);
}

interface VsCardStakesArgs {
  milestone: number | null;
  atRisk: boolean;
}

// Issue #135 : ligne de tension sous le badge du VS card. Le milestone (7/30/100
// franchi par une victoire aujourd'hui) prime sur atRisk s'ils sont vrais tous
// les deux — un palier qui tombe est un enjeu plus fort qu'un simple risque.
export function vsCardStakesLine(
  level: AggressivityLevel,
  { milestone, atRisk }: VsCardStakesArgs,
  seed: number = randomSeed(),
): string | null {
  if (milestone !== null) {
    const pools: Record<AggressivityLevel, Array<(n: number) => string>> = {
      doux: [
        (n) => `Une victoire aujourd'hui et la série atteint ${n}.`,
        (n) => `${n} jours d'affilée, à portée de main aujourd'hui.`,
        (n) => `Le palier de ${n} se joue sur ce combat.`,
        (n) => `Encore un pas, et la série touche ${n}.`,
        (n) => `${n} jours de constance, si aujourd'hui tient.`,
      ],
      direct: [
        (n) => `Gagne aujourd'hui et la série passe à ${n} !`,
        (n) => `Le palier ${n} se joue maintenant.`,
        (n) => `À un combat du cap des ${n}.`,
        (n) => `${n} jours d'affilée si tu closes aujourd'hui.`,
        (n) => `Ce combat peut t'amener à ${n} de série.`,
      ],
      brut: [
        (n) => `Gagne ça et t'exploses le cap des ${n}, putain !`,
        (n) => `${n} de série à portée, magne-toi.`,
        (n) => `Le palier ${n} se joue là, maintenant.`,
        (n) => `Un combat de plus et ${n} tombe, merde.`,
        (n) => `${n} d'affilée si tu te loupes pas aujourd'hui.`,
      ],
    };
    return pickVariant(pools[level], seed)(milestone);
  }

  if (atRisk) {
    const pools: Record<AggressivityLevel, string[]> = {
      doux: [
        "Le joker de la semaine est déjà posé. La série tient à un fil.",
        "Plus de marge cette semaine. Ce combat compte double.",
        "La série est fragile aujourd'hui. Un pas de plus suffit.",
        "Le budget de la semaine est épuisé. Prends soin de la série.",
        "Aucun joker en réserve. Aujourd'hui pèse plus lourd.",
      ],
      direct: [
        "Plus de joker cette semaine — la série est en jeu.",
        "Un faux pas aujourd'hui et la série casse.",
        "Le budget hebdo est grillé. Ce combat compte.",
        "Série fragile : plus de marge d'erreur cette semaine.",
        "Zéro joker restant. Aujourd'hui, ça se joue pour de vrai.",
      ],
      brut: [
        "Plus de joker, la série est en danger, putain.",
        "Un faux pas et la série explose. Fais gaffe.",
        "Budget hebdo cramé. Ce combat compte pour de vrai.",
        "Zéro marge cette semaine. Ne fous pas en l'air la série.",
        "La série tient sur un fil, merde. Assure aujourd'hui.",
      ],
    };
    return pickVariant(pools[level], seed);
  }

  return null;
}
