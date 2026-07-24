# Parcours utilisateurs & carte des écrans — Dodojo (issue #50)

> Dernière mise à jour : 2026-07-24
> Objectif : donner une vue d'ensemble des écrans réels de l'app et de comment
> ils sont reliés, pour choisir *quels parcours* mériteraient un e2e "bout en
> bout" (en plus des e2e "simplistes" par feature isolée, déjà nombreux dans
> `e2e/`). À tenir à jour si un écran ou un lien de navigation change
> (cf. règle de mise à jour de `CLAUDE.md`).

## Carte des écrans (liens réels, hors debug interne)

```
/welcome  --signup-->  /onboarding  --pseudo/avatar/ton-->  /  (Arène)
/login    --login-->   /  (Arène)

/  (Arène) <--BottomNav--> /qg <--BottomNav--> /echoppe
                            |
                            +--> /pantheon          (lien "Le Panthéon")
                            +--> /qg/entrainement   (lien "Mode Entraînement")
                            +--> /guide             (lien "Manuel du Dojo")
                            |      +--> /guide/[slug]  (article, retour via BackLink)
                            +--> /guide/or           (lien direct "Comment gagner de l'or ?")

/  (Arène) --tâches en retard--> Rituel du Réveil (overlay bloquant, au chargement)
/  (Arène) --clôture manuelle--> Rituel du Crépuscule (dialog non-bloquant)
```

Écrans **volontairement hors parcours** (jamais atteints par une vraie
navigation utilisateur) : `/roster-preview-8f3a2c9d`, `/skins-preview-4c7a1e9b`
(debug interne, `noindex`, non liés en UI — cf. `CLAUDE.md`), `/offline`
(fallback PWA hors-ligne).

## Parcours utilisateurs identifiés (bout en bout)

| # | Parcours | Écrans traversés | e2e correspondant |
|---|----------|-------------------|--------------------|
| 1 | Cycle complet d'une journée : résoudre les restes de la veille, se battre, clôturer, consulter son palmarès | Arène (Réveil) → Arène (combat) → Rituel du Crépuscule → Panthéon → QG | `e2e/journey-full-day.spec.ts` |
| 2 | Premier jour d'un nouvel utilisateur : inscription jusqu'à la découverte du QG et du Guide | Welcome → Onboarding → Arène (coach) → QG → Guide | `e2e/onboarding.spec.ts` |
| 3 | Progression économique : débloquer et équiper un héros, vérifier que ça se voit en combat | Arène → Échoppe (achat + équipement) → Arène (sprite mis à jour) | `e2e/journey-hero-economy.spec.ts` |

Ces parcours **complètent** la suite existante — les e2e "simplistes" listés
ci-dessous restent nécessaires pour verrouiller le comportement précis d'une
feature isolée (ils sont plus rapides à diagnostiquer en cas d'échec, un
parcours qui casse ne dit pas *où*) :

`combat-loop`, `subtasks`, `nesting-dnd`, `deadlines`, `mic-dictation`,
`wake-up-ritual`, `crepuscule-recap`, `echoppe`, `echoppe-skins`, `streaks`,
`dojo-gauge`, `guide`.

## Quand ajouter un nouveau parcours vs un nouvel e2e isolé

- **Nouvel e2e isolé** : la feature ne concerne qu'un seul écran, ou vérifie
  un détail de comportement (ex. calcul de HP, format d'un popover) déjà
  couvert unitairement mais qu'on veut sécuriser côté UI.
- **Nouveau parcours** : la feature introduit ou modifie un enchaînement
  d'écrans (nouveau lien de nav, nouvelle étape dans un tunnel existant), ou
  qu'un bug réel n'apparaît qu'en traversant plusieurs écrans (cf. bug #70,
  `WakeUpRitual` → Arène — un test isolé sur `/` seul ne l'aurait pas capté).
