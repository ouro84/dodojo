# Tone of Voice — Dodojo

> Date : 2026-07-08 (révisé 2026-07-24, issue #51 — reframe "Démon Intérieur")
> Statut : Validé

## Décision

Direction révisée le 2026-07-24 (remplace "Dojo de Rue"/vibe Ryu-Ken, jugée trop plaquée en vernis martial-arts externe pour un concept devenu intime). Nouvelle ambiance : "Le Démon Intérieur" — le Boss n'est pas un rival extérieur, c'est tout ce qui traîne encore, non tranché, dans ta tête. Détail complet du reframe : `docs/superpowers/specs/2026-07-24-demon-interieur-identite-design.md`.

## Deux voix distinctes

### La Voix
Ta propre discipline, qui te parle depuis l'intérieur — pas un mentor externe qui commente de loin. Commente tes combats quotidiens (actions du joueur, stats, transitions d'écran : heal, dégâts, level up, Réveil, Dernier Round). Point de vue "je sens qu'on avance" (même corps, même tête), jamais "je t'ai vu progresser" (regard extérieur). Tutoie systématiquement, s'adresse au joueur par son **pseudo/prénom défini au profil** (`profiles.username`) — jamais par "Héros" ou autre appellation générique.

### Voix Boss
Nargue le joueur en 1ère personne aux moments clés (notifications, attaques surprises, ricanements sur rage quit). Antagoniste interne : ce n'est plus un rival de rue, c'est le doute qui vient de toi qui te parle ("tu vas encore lâcher, comme d'habitude").

## Registre & vocabulaire

- Tutoiement systématique, adresse par `{pseudo}` partout où La Voix/le Boss s'adresse au joueur.
- Références arcade universelles (pas martial-arts/japonaises) : K.O., Combo, Perfect, Round.
- Ton constant sur toute l'app (onboarding, erreurs techniques, réglages inclus) — jamais de bascule vers un registre corporate/neutre.

## Dosage des jurons (règle clé)

Jurons légers autorisés dans toute l'app (`putain`, `bordel`, `enfoiré`) mais **réservés aux pics émotionnels réels** :
- Level up, Perfect (Boss K.O.), victoire du jour (Dernier Round), erreur technique frustrante.

**Jamais** sur les actions routinières (ajout de tâche, validation normale, navigation, empty states) — le juron doit sonner comme une réaction vraie et rare, pas un tic de langage mécanique sur chaque ligne. Révisé par le palier `brut` de la jauge Volume Intérieur (US-49/US-54) — voir `docs/superpowers/specs/2026-07-23-agressivite-copy-design.md`.

## Limite dure (garde-fou)

Les jurons/piques ciblent toujours le Boss, la tâche ou la situation — **jamais une attaque personnelle réelle contre le joueur**. Pas de vocabulaire plus fort que le trio putain/bordel/enfoiré au palier `doux`/`direct` (aucune insulte à caractère sexuel, raciste, etc., à aucun palier).

## Exemples de référence par contexte

| Contexte | Voix | Exemple |
|---|---|---|
| Heal (ajout tâche, US-06) | La Voix | "Le Boss se soigne, +20 HP. Encore un truc qui traîne, {pseudo}." |
| Dégât (validation, US-21) | La Voix | "PAN ! -20 HP. Combo enclenché !" |
| Level up (US-09) | La Voix | "Putain, LEVEL UP ! Niveau 2 débloqué, {pseudo}." |
| Dernier Round, victoire (US-07) | La Voix | "Journée bouclée. Le Boss est à terre, va te reposer, {pseudo}." |
| Le Réveil (US-08) | La Voix | "Ces tâches d'hier te collent aux basques. On annihile ou on reporte ?" |
| Rage Quit (US-15) | Boss | "Tâche abandonnée. -5 XP. Le Boss ricane." |
| Perfect (US-16) | La Voix | "PERFECT, bordel ! Le Boss explose en pixels. T'es une machine, {pseudo}." |
| Erreur technique | La Voix | "Bordel, ça a planté côté serveur. Réessaie." |
| Empty state (aucune tâche) | La Voix | "Aucun monstre à l'horizon. Balance ta première quête." |
| Notification (US-11) | Boss | "Je ricane depuis ta poche. Encore 3 monstres avant le Dernier Round." |
| Attaque surprise (US-05) | Boss | "14h00 pétantes. T'as pas coché à temps, tant pis pour tes HP." |

## Impact

- Toute copie UI (microcopy, toasts, punchlines) doit utiliser `{pseudo}` dynamique et respecter la règle de dosage des jurons ci-dessus.
- Le profil permet de définir un pseudo/prénom dès l'onboarding — pas de fallback "Héros".

## Hors scope

- Copie exhaustive de tous les écrans (à faire au fil de l'implémentation des US, en respectant ce guide).
- Design des animations/flash accompagnant ces textes.
