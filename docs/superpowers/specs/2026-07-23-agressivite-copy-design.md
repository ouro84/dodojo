# Jauge d'agressivité (Volume Intérieur, ex-"Dojo Gauge") + Registre de copy centralisé — US-49/US-54

> Date : 2026-07-23
> Statut : Validé
> Résout : issue #49 (audit textes + dictionnaire) et issue #54 (niveau d'agressivité réglable), traitées comme un seul chantier combiné.

## Contexte

Deux besoins distincts mais couplés :
- **#49** — auditer tous les textes user-facing de l'app, homogénéiser le ton, produire un dictionnaire interne des notions propres à l'app (Rituel du Réveil, Rituel du Crépuscule, Rage Quit, Perfect, Combo, Dojo Gauge...) avec le texte tel que vu par l'utilisateur + sa définition/utilité. Revue produit marketing du ton = **hors périmètre de ce chantier technique**.
- **#54** — ajouter une jauge d'agressivité réglable à tout moment (Doux / Direct / Brut, ex-Sensei/Sparring/Street), pilotant le ton de La Voix (narrateur) **et** du Boss, réglable dès l'onboarding.

Faire #54 seul aurait produit une matrice de ton incomplète (les scénarios non encore audités manqueraient de variantes). Les deux issues sont donc résolues par un seul livrable : un registre de copy centralisé qui sert à la fois d'inventaire exhaustif (#49) et de support natif aux 3 variantes de ton (#54).

État actuel (vérifié par exploration du code) : aucun registre central n'existe. Les punchlines "voix" (Sensei/Boss) sont câblées en dur dans les composants (`Arena.tsx`, `WakeUpRitual.tsx`, `PerfectOverlay.tsx`, `CrepusculeRecap.tsx`, `LevelUpOverlay.tsx`, `ArenaError.tsx`) sauf `lib/push-copy.ts`, seul module déjà structuré en gabarits (mais sans dimension de niveau).

## Décisions de portée

1. **Seuls les textes "voix"** (narration Sensei + réplique Boss) ont 3 variantes de ton. Le chrome UI neutre (labels de boutons, placeholders de formulaire) reste inline, une seule version, non concerné par le niveau — recensé dans l'audit mais pas migré vers le registre.
2. **Dictionnaire des notions = doc interne uniquement**, jamais exposé en UI (pas d'ajout au Guide US-28).
3. Défaut du niveau : `direct` (== "Direct", "Défaut / Équilibré" dans la matrice de #54).

## Modèle de données

Migration dédiée single-column, même patron que `timezone` / `equipped_hero_id` :

```sql
-- supabase/migrations/<timestamp>_add_profile_aggressivity_level.sql
alter table public.profiles
  add column aggressivity_level text not null default 'direct'
  check (aggressivity_level in ('doux', 'direct', 'brut'));
```

> Révisé le 2026-07-24 (issue #51, reframe "Démon Intérieur") : les valeurs
> d'origine (`sensei`/`sparring`/`street`) ont été renommées en
> `doux`/`direct`/`brut` par la migration
> `supabase/migrations/20260724160000_rename_aggressivity_levels.sql`.

`types/index.ts` : `AggressivityLevel = 'doux' | 'direct' | 'brut'` et le champ `aggressivity_level: AggressivityLevel` sur `Profile`.

Pas de policy RLS spécifique nécessaire : colonne couverte par les policies existantes de `profiles` (lecture/écriture par le propriétaire), pas de donnée soumise à RG-04 (préférence réversible, comme `equipped_hero_id`).

## Registre de copy (`lib/copy/`)

Un fichier pur par domaine, même convention que `lib/bosses.ts` / `lib/push-copy.ts` (règle de code #2 du CLAUDE.md : logique isolée, testable sans UI).

```
lib/copy/
├── types.ts          # AggressivityLevel (réexporté depuis types/index.ts), helpers de composition
├── combat.ts          # heal, dégât, combo, level up, Perfect/K.O., empty state
├── rituals.ts          # Rituel du Réveil, Rituel du Crépuscule
├── rage-quit.ts        # confirmation + ricanement Boss + undo
├── notifications.ts    # remplace lib/push-copy.ts
├── errors.ts            # erreurs techniques (Arena, autres écrans)
└── deadline.ts          # attaque surprise (deadline ratée)
```

Chaque scénario exporte une fonction pure :
```ts
export function heal(level: AggressivityLevel, args: { pseudo: string }): string
```

Pour les scénarios ayant déjà plusieurs gabarits tirés au hasard (ex. `push-copy.ts`, 4 templates) : le nombre de gabarits ne change pas, chaque gabarit gagne ses 3 variantes de ton (pas 3× plus de gabarits à écrire) :

```ts
type ReminderTemplate = Record<AggressivityLevel, (n: number) => string>;
const REMINDER_TEMPLATES: ReminderTemplate[] = [ /* 4 entrées, chacune {sensei, sparring, street} */ ];
```

Chaque fichier a son `*.test.ts` (Vitest), un cas par niveau minimum.

## Règle des jurons — révision de la spec 2026-07-08

Remplace la section "Dosage des jurons" de `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md` (ce fichier reste la référence historique, mais cette section-ci fait foi désormais) :

- **Paliers `doux` et `direct`** : règle inchangée — jurons du trio `putain` / `bordel` / `enfoiré`, réservés aux pics émotionnels réels (level up, Perfect, victoire, échec net, erreur technique frustrante). Jamais sur actions routinières.
- **Palier `brut`** : override — jurons/registre cru autorisés même sur actions routinières (empty state, erreurs techniques inclus). Vocabulaire élargi : `merde`, `con`, `connard`, `foutre`, en plus du trio existant.
- **Garde-fou inchangé à tous les paliers** : jurons/piques toujours dirigés vers le Boss, la tâche ou la situation — jamais une attaque personnelle réelle contre le joueur. Aucune insulte à caractère sexuel ou raciste, à aucun palier.

## Boss

Le Boss varie aussi selon le niveau (pas seulement le Sensei), conformément au texte de #54. Les scénarios où le Boss s'exprime (notifications push, attaque surprise/deadline ratée, ricanement rage quit) ont donc également leurs 3 variantes dans `lib/copy/`.

## Onboarding

`app/onboarding/OnboardingFlow.tsx` : le type `step` (actuellement `"pseudo" | "avatar"`) devient `"pseudo" | "avatar" | "agressivite"`. Nouvelle étape insérée entre `"avatar"` et la soumission finale (`createProfile`). Sélecteur à 3 cartes (Doux / Direct / Brut), chaque carte avec son nom + une courte description (Philosophe/Zen, Franc-parler, Arcade/Sans filtre). Pas de slider continu.

`app/onboarding/actions.ts` (`createProfile`) : accepte et persiste `aggressivity_level` choisi (fallback `direct` si l'étape est sautée/non atteinte).

## Réglage à tout moment (Le Vestiaire)

`app/qg/page.tsx` : section "Volume Intérieur" (aux côtés d'`IntegrationsSection`), même sélecteur à 3 cartes que l'onboarding, composant client dédié `components/qg/AggressivityLevelSection.tsx`. Modification immédiate via `updateAggressivityLevel(level: AggressivityLevel)` (`app/actions/profile.ts`).

## Audit #49 — livrable

Document interne (jamais exposé en UI) : `docs/superpowers/specs/2026-07-23-audit-textes-dictionnaire.md`, produit pendant l'implémentation (au fil de la migration de chaque fichier vers `lib/copy/`), contenant :

1. **Table exhaustive des textes** : fichier:ligne, texte, voix (Sensei / Boss / neutre), leveled (oui/non), contexte d'usage.
2. **Dictionnaire des notions** : chaque mécanique nommée dans l'app (Rituel du Réveil, Rituel du Crépuscule, Rage Quit, Perfect, Combo, Dojo Gauge, Panthéon, Échoppe...) — libellé exact vu par l'utilisateur + définition/usage, pour servir de base à la revue produit marketing (hors périmètre ici).

## Migration des textes existants

Fichiers concernés (recensés par exploration) et leur nouvelle source :

| Ancien emplacement | Nouveau (`lib/copy/`) |
|---|---|
| `components/combat/Arena.tsx` (heal/dégât/combo/empty state/rage quit/deadline) | `combat.ts`, `rage-quit.ts`, `deadline.ts` |
| `components/combat/WakeUpRitual.tsx` | `rituals.ts` |
| `components/combat/CrepusculeRecap.tsx` | `rituals.ts` |
| `components/combat/PerfectOverlay.tsx` | `combat.ts` |
| `components/combat/LevelUpOverlay.tsx` | `combat.ts` |
| `components/combat/ArenaError.tsx` | `errors.ts` |
| `lib/push-copy.ts` | `notifications.ts` (remplace le fichier, appelants mis à jour : route cron US-11) |

Les composants reçoivent `aggressivityLevel` en prop, threadé depuis le profil déjà chargé côté serveur (même mécanisme que `equippedHeroId`/`equippedSkinId`). La route cron (`app/api/cron/push-reminders/route.ts`) charge `aggressivity_level` en même temps que `timezone` (déjà fetché par profil pour le calcul du jour local).

## Tests

- `lib/copy/*.test.ts` : un test par scénario × 3 niveaux minimum (contenu non vide, respect du garde-fou jurons — pas d'assertion de contenu exact au mot près, juste absence de vocabulaire interdit hors niveau `street`).
- Mise à jour des tests existants qui importent `lib/push-copy.ts` directement.
- E2E (Playwright) : pas de nouveau scénario dédié obligatoire — vérification manuelle suffit pour un réglage de préférence non bloquant (cohérent avec `ADR.md`/conventions e2e du projet, réservées aux parcours critiques).

## Hors scope

- Pas de traduction/i18n multi-langue : le registre reste 100% français.
- Pas de niveau custom/slider continu : 3 niveaux fixes uniquement.
- Dictionnaire non exposé aux utilisateurs (pas d'ajout au Guide US-28).
- Revue produit marketing du ton final : hors périmètre technique, se fait ailleurs sur la base du doc d'audit produit.
