# Tone of Voice — Dodojo

> Date : 2026-07-08
> Statut : Validé

## Décision

Direction révisée le 2026-07-08 (remplace le premier draft "Maître du Donjon de la Street", jugé confus). Nouvelle ambiance : élève de dojo d'arts martiaux qui se bat dans la rue — vibe Ryu/Ken (Street Fighter). Discipline et humilité du dojo, mais grinta et franc-parler du combat de rue.

## Deux voix distinctes

### Voix Narrateur (Sensei)
Le mentor du dojo qui commente tes combats de rue quotidiens : actions du joueur, stats, transitions d'écran (heal, dégâts, level up, rituels). Discipline et respect du dojo, mais pas coincé — reste franc et direct comme un combat de rue. Tutoie systématiquement, s'adresse au joueur par son **pseudo/prénom défini au profil** (`profiles.username`) — jamais par "Héros" ou autre appellation générique.

### Voix Boss
Nargue le joueur en 1ère personne aux moments clés (notifications, attaques surprises, ricanements sur rage quit). Toujours dans le cadre de la fiction de combat.

## Registre & vocabulaire

- Tutoiement systématique, adresse par `{pseudo}` partout où le narrateur/Boss s'adresse au joueur.
- Références Street Fighter soft : K.O., Combo, Perfect, Fatality, Round.
- Ton constant sur toute l'app (onboarding, erreurs techniques, settings inclus) — jamais de bascule vers un registre corporate/neutre.

## Dosage des jurons (règle clé)

Jurons légers autorisés dans toute l'app (`putain`, `bordel`, `enfoiré`) mais **réservés aux pics émotionnels réels** :
- Level up, Perfect (Boss K.O.), victoire du jour (Rituel Obi-Wan), erreur technique frustrante.

**Jamais** sur les actions routinières (ajout de tâche, validation normale, navigation, empty states) — le juron doit sonner comme une réaction vraie et rare, pas un tic de langage mécanique sur chaque ligne.

## Limite dure (garde-fou)

Les jurons/piques ciblent toujours le Boss, la tâche ou la situation — **jamais une attaque personnelle réelle contre le joueur**. Pas de vocabulaire plus fort que le trio putain/bordel/enfoiré (aucune insulte à caractère sexuel, raciste, etc.).

## Exemples de référence par contexte

| Contexte | Voix | Exemple |
|---|---|---|
| Heal (ajout tâche, US-06) | Sensei | "Le Boss se soigne, +20 HP. Il prend des forces, {pseudo}." |
| Dégât (validation, US-21) | Sensei | "PAN ! -20 HP. Combo enclenché !" |
| Level up (US-09) | Sensei | "Putain, LEVEL UP ! Niveau 2 débloqué, {pseudo}." |
| Rituel Obi-Wan victoire (US-07) | Sensei | "Journée bouclée. Le Boss est à terre, va te reposer, {pseudo}." |
| Rituel du Réveil (US-08) | Sensei | "Ces tâches d'hier te collent aux basques. On annihile ou on reporte ?" |
| Rage Quit (US-15) | Sensei | "Tâche abandonnée. -5 XP. Le Boss ricane." |
| Perfect (US-16) | Sensei | "PERFECT, bordel ! Le Boss explose en pixels. T'es une machine, {pseudo}." |
| Erreur technique | Sensei | "Bordel, ça a planté côté serveur. Réessaie." |
| Empty state (aucune tâche) | Sensei | "Aucun monstre à l'horizon. Balance ta première quête." |
| Notification (US-11) | Boss | "Je ricane depuis ta poche. Encore 3 monstres avant le Rituel." |
| Attaque surprise (US-05) | Boss | "14h00 pétantes. T'as pas coché à temps, tant pis pour tes HP." |

## Impact

- Toute copie UI (microcopy, toasts, punchlines) doit utiliser `{pseudo}` dynamique et respecter la règle de dosage des jurons ci-dessus.
- Le profil doit permettre de définir un pseudo/prénom dès l'onboarding (contrainte pour US-14 / Rituel du Matin) — pas de fallback "Héros" prévu, à trancher lors du brainstorm de l'onboarding.

## Hors scope

- Copie exhaustive de tous les écrans (à faire au fil de l'implémentation des US, en respectant ce guide).
- Design des animations/flash accompagnant ces textes.
