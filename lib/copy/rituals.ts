import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function wakeUpSubtitle(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Les tâches d'hier attendent encore une réponse. Prends un instant, règle-les avant d'avancer.",
      "Ce qui n'a pas été traité hier reste là, tranquillement. Occupe-t'en avant de continuer.",
      "Quelques restes de la veille patientent. Rien d'urgent, mais rien qui se règle seul non plus.",
      "Avant d'avancer, un instant pour ce qui traîne depuis hier.",
      "Ta tête attend que tu règles ces quelques restes avant d'ouvrir un nouveau combat.",
    ],
    direct: [
      "Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d'entrer dans l'Arène.",
      "Il reste des comptes à régler d'hier. Passe par là avant l'Arène.",
      "Les restes de la veille t'attendent au tournant. On règle ça d'abord.",
      "Hier n'est pas totalement fini pour toi. Termine, puis on entre.",
      "Quelques monstres d'hier traînent encore. Avant l'Arène, tu les règles.",
    ],
    brut: [
      "Tes monstres d'hier sont pas partis, ils t'ont attendu. Nettoie ce bordel avant d'entrer.",
      "Ça, c'est les restes d'hier, et ouais, ils sont encore là. Dégage-moi ça avant d'avancer.",
      "T'as cru que fuir hier suffisait ? Non. Nettoie, putain, avant d'entrer dans l'Arène.",
      "Les monstres d'hier ont fait le pied de grue toute la nuit. Réglé-moi ça direct.",
      "Bordel de restes de la veille encore plantés là. On nettoie avant de taper la suite.",
    ],
  };
  return pickVariant(pools[level], seed);
}

export function crepusculeHeader(level: AggressivityLevel, victory: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    doux: ["Journée accomplie.", "Dernier Round."],
    direct: ["Perfect !", "Dernier Round"],
    brut: ["NETTOYÉ !", "Dernier Round."],
  };
  const [victoryHeader, retreatHeader] = headers[level];
  return victory ? victoryHeader : retreatHeader;
}

interface CrepusculeLineArgs {
  victory: boolean;
  username: string;
  bossName: string;
}

export function crepusculeLine(
  level: AggressivityLevel,
  args: CrepusculeLineArgs,
  seed: number = randomSeed(),
): string {
  const { victory, username, bossName } = args;

  if (victory) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      doux: [
        (u, b) => `${u}, ${b} s'est incliné. Repose-toi, ta tête attendra ta prochaine sortie.`,
        (u, b) => `Journée close, ${u}. ${b} n'a plus rien à te disputer ce soir.`,
        (u, b) => `${b} recule pour aujourd'hui, ${u}. Le repos aussi fait partie du chemin.`,
        (u, b) => `${u}, la journée se referme sur ${b} vaincu. Rien à ajouter, tout est fait.`,
        (u, b) => `${b} s'efface, ${u}. Un jour de plus, calmement mené à son terme.`,
      ],
      direct: [
        (u, b) => `${u}, tu as terrassé ${b}. Ta tête est calme pour ce soir.`,
        (u, b) => `${b} plié, journée bouclée, ${u}. Va souffler un peu.`,
        (u, b) => `${u}, encore une journée pliée. ${b} n'a pas fait le poids.`,
        (u, b) => `${b} est tombé pour de bon ce soir, ${u}. Bien joué.`,
        (u, b) => `Journée terminée, ${u}. ${b} range ses affaires, tu peux ranger les tiennes aussi.`,
      ],
      brut: [
        (u, b) => `${u}, ${b} est au tapis, putain. Ta tête te doit le respect ce soir.`,
        (u, b) => `NETTOYÉ, ${u} ! ${b} valait rien face à toi ce soir.`,
        (u, b) => `${b} dégagé, journée pliée, ${u}. Même le Dernier Round applaudit, bordel.`,
        (u, b) => `${u}, tu viens de fermer boutique sur ${b}. Prochaine victime demain.`,
        (u, b) => `${b} en miettes, ${u}. Ta tête s'en souviendra un moment, merde.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  const pools: Record<AggressivityLevel, Array<(u: string) => string>> = {
    doux: [
      (u) => `${u}, tu poses les armes pour ce soir. Aucune honte à ça — demain reste un autre combat.`,
      (u) => `${u}, la journée s'arrête ici. Ce n'est pas un échec, juste une pause.`,
      (u) => `Tu t'arrêtes là ce soir, ${u}. Demain reprend où tu l'as laissé.`,
      (u) => `${u}, rien ne presse à forcer la fin. Reviens demain, l'esprit reposé.`,
      (u) => `La journée se clôt sans victoire, ${u}. Elle compte quand même.`,
    ],
    direct: [
      (u) => `${u}, tu poses les armes. Pas de honte — demain est un autre combat.`,
      (u) => `${u}, journée pas terminée, mais on arrête là pour ce soir.`,
      (u) => `Tu rentres sans le K.O. ce soir, ${u}. Ça arrive, demain on recommence.`,
      (u) => `${u}, pas de victoire cette fois. Repos, et on retente demain.`,
      (u) => `Journée close sans avoir plié le Boss, ${u}. Pas grave, il attendra.`,
    ],
    brut: [
      (u) => `${u}, tu esquives ce soir ? D'accord. Mais ce combat t'attend au tournant, demain.`,
      (u) => `Tu rentres bredouille, ${u}. Le Boss aura de la marge, mais demain il paiera.`,
      (u) => `${u}, pas de K.O. ce soir. Tant pis, on remet ça direct demain.`,
      (u) => `Bon, ${u}, ce soir c'est match nul. Le Boss t'attend de pied ferme demain.`,
      (u) => `${u}, tu lâches l'affaire pour aujourd'hui. Le combat, lui, n'oublie rien.`,
    ],
  };
  return pickVariant(pools[level], seed)(username);
}
