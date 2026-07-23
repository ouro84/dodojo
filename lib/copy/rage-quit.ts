import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

interface RageQuitConfirmArgs {
  taskTitle: string;
  penalty: number;
}

export function rageQuitConfirmBody(
  level: AggressivityLevel,
  args: RageQuitConfirmArgs,
  seed: number = randomSeed(),
): string {
  const { taskTitle, penalty } = args;
  const pools: Record<AggressivityLevel, Array<(t: string, p: number) => string>> = {
    sensei: [
      (t, p) => `Abandonner « ${t} » coûte −${p} XP. Une pause consciente, pas un échec — le Boss retrouve un peu de terrain.`,
      (t, p) => `Laisser « ${t} » de côté, c'est −${p} XP. Rien de grave, juste un choix assumé.`,
      (t, p) => `« ${t} » s'arrête là, −${p} XP. Le Boss regagne un peu de terrain, sans drame.`,
      (t, p) => `Renoncer à « ${t} » coûte −${p} XP. Un pas de côté, pas une chute.`,
      (t, p) => `« ${t} » abandonnée, −${p} XP. Le terrain repris n'efface pas ce qui a déjà été fait.`,
    ],
    sparring: [
      (t, p) => `Abandonner « ${t} » coûte −${p} XP. Le Boss rétrécit, mais il ricanera.`,
      (t, p) => `Lâcher « ${t} », c'est −${p} XP direct. Le Boss va prendre un peu de volume.`,
      (t, p) => `« ${t} » à l'abandon, −${p} XP. Le Boss va s'en vanter un peu.`,
      (t, p) => `Tu jettes l'éponge sur « ${t} » ? −${p} XP, et le Boss qui regagne du terrain.`,
      (t, p) => `« ${t} » abandonnée : −${p} XP. Le Boss repart plus costaud.`,
    ],
    street: [
      (t, p) => `Lâcher « ${t} », ça pique −${p} XP direct. Le Boss va se foutre de ta gueule.`,
      (t, p) => `« ${t} » à la poubelle, −${p} XP direct. Le Boss va bien se marrer, merde.`,
      (t, p) => `Tu jettes l'éponge sur « ${t} », −${p} XP. Le Boss va en faire des caisses.`,
      (t, p) => `Abandon de « ${t} », −${p} XP dans les dents. Le Boss reprend du poil de la bête, putain.`,
      (t, p) => `« ${t} » dégagée, −${p} XP. Prépare-toi, le Boss va te chambrer sec.`,
    ],
  };
  return pickVariant(pools[level], seed)(taskTitle, penalty);
}

export function rageQuitPunchline(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    sensei: [
      "Le Boss hausse les épaules : « Une pause. Reviens quand tu es prêt. »",
      "Le Boss reste silencieux : « Ce n'est qu'un round. Le combat continue. »",
      "Le Boss incline la tête : « Se retirer aussi, c'est un choix. »",
      "Le Boss attend, sans un mot. Il sait que tu reviendras.",
      "Le Boss note simplement : « Un pas de côté n'efface pas le chemin. »",
    ],
    sparring: [
      "Le Boss ricane : « Déjà à terre ? Relève-toi. »",
      "Le Boss sourit : « Je prends ce que tu me laisses. »",
      "Le Boss hausse un sourcil : « Tu reviendras, ils reviennent toujours. »",
      "Le Boss se marre doucement : « Une victoire facile, mais une victoire. »",
      "Le Boss reprend des forces : « Merci pour le cadeau. »",
    ],
    street: [
      "Le Boss se marre : « Déjà cuit ? Merde, relève-toi et reviens te battre. »",
      "Le Boss explose de rire : « Sérieux ? Bordel, quelle chute. »",
      "Le Boss ricane fort : « Merci pour le cadeau, putain, j'en demandais pas tant. »",
      "Le Boss savoure : « Encore un qui se casse. Ça sent le vécu, bordel. »",
      "Le Boss se frotte les mains : « Une victoire gratuite, merde, autant en profiter. »",
    ],
  };
  return pickVariant(pools[level], seed);
}
