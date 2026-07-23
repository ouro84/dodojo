// Pioche stable dans un pool de variantes : le seed doit être calculé UNE
// SEULE FOIS au moment où l'évènement se déclenche (mount d'un overlay,
// transition d'état) et réutilisé à chaque re-rendu — sinon le texte changerait
// sous les yeux de l'utilisateur pendant qu'il le lit (ex. poll ~45s de
// l'Arène pour les deadlines). Générer un nouveau seed = générer une nouvelle
// punchline ; réutiliser le même seed fige le choix pour cette instance.
export function pickVariant<T>(pool: readonly T[], seed: number): T {
  const index = ((seed % pool.length) + pool.length) % pool.length;
  return pool[index];
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
