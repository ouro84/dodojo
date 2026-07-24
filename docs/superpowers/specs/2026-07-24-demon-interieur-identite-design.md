# Design — "Le Démon Intérieur" : refonte identité/ton/récit (issue #51)

> Date : 2026-07-24
> Issue : #51 ("PWA et product marketing" — scope réduit à la passe identité visuelle/produit marketing seule, PWA extraite en #58 lors du cadrage Sprint 3)
> Statut : validé en brainstorming, prêt pour planification

---

## 1. Contexte et portée

Le concept narratif actuel ("Dojo de Rue", vibe Ryu/Ken/Street Fighter, Sensei mentor externe + Boss rival) est documenté dans `PRODUCT.md` et `DESIGN.md`. Ce document ne le corrige pas en surface : il **remplace le sens** que porte la mécanique de jeu existante, sans toucher à la mécanique elle-même.

**Fixe (non négociable, validé en amont)** :
- Mécanique de jeu : Boss du jour, HP/XP, tâche ajoutée = +20 HP Boss, tâche terminée = dégâts, héros/streaks/or/roster de 12 boss/décors — tout `lib/game-engine.ts` reste inchangé.
- Palette visuelle (`DESIGN.md`) : rouge combat/indigo néon/or reste juste, aucune raison esthétique de la changer.
- Nom de l'app : **Dodojo** reste.

**Ouvert et retravaillé ici** : l'univers fictionnel, le sens des personnages (Boss/Sensei/Héros), le ton, l'onboarding narratif, le logo/identité visuelle qui en découle.

**Hors scope** : PWA (#58), toute mécanique de jeu nouvelle, copy orientée extérieur (tagline store, landing page marketing) — cette passe produit une mise à jour de la documentation de marque interne (`PRODUCT.md`, `DESIGN.md`, specs de ton) et l'intégration du nouveau logo dans le pipeline d'assets existant. Le réécriture effective de tous les fichiers `lib/copy/*` sera scopée dans le plan d'implémentation, pas détaillée texte par texte ici.

---

## 2. Le reframe : "Le Démon Intérieur"

**Ancien sens** : tu es un élève de dojo qui se bat dans la rue contre un rival (le Boss), un Sensei externe commente ton combat.

**Nouveau sens** : le Boss n'est pas un rival extérieur. C'est **tout ce qui traîne encore, non tranché, dans ta tête** — la charge mentale elle-même, rendue visible et combattable. Le Sensei n'est plus un mentor qui te regarde de loin : c'est **ta propre discipline qui te parle depuis l'intérieur**. Tu ne gagnes pas un combat contre un ennemi extérieur — tu vides ta tête.

Le dojo devient littéralement intérieur : lieu d'entraînement de l'esprit, pas de baston de rue. Ça n'oblige à aucun changement de nom (Dodojo n'a jamais eu besoin du mot "rue" pour fonctionner).

### 2.1 Le lien HP/tâche (le fil narratif validé)

Le Boss grandit quand tu ajoutes une tâche, rétrécit quand tu la termines — mécanique déjà en place, jusqu'ici non-justifiée narrativement (pourquoi "soigner" un ennemi en ajoutant une tâche ?). Nouveau sens : **chaque tâche ajoutée est un truc de plus qui traîne, non résolu, qui le nourrit ; chaque tâche terminée est un truc de moins dans ta tête, il rétrécit.** Ce n'est pas ta faiblesse qui grandit (pas culpabilisant), c'est la pile de choses non réglées — un fait neutre, pas un jugement de caractère.

### 2.2 Les masques quotidiens

Le roster de 12 monstres déjà intégré (Frost Guardian, Demon Slime, Cthulhu, Mino, low-boss...) devient littéralement **les masques que porte ce qui traîne dans ta tête**. Un jour ton "reste à faire" a la tête d'un golem de glace, un autre celle d'un slime — jamais deux jours de suite le même visage (déjà garanti par `pickDailyBoss`, exclusion des 2 derniers jours), mais toujours la même chose en dessous. Aucun changement technique : le tirage aléatoire existant (`resolveDailyBoss`, table `daily_boss`) illustre déjà exactement ce que raconte ce reframe. Seule la copy qui introduit le Boss du jour (Réveil, Arène) change de sens.

### 2.3 Les voix

- **Sensei — voix intérieure.** Change de point de vue : pas "je t'ai vu progresser" (regard extérieur) mais "je sens qu'on avance" (même corps, même tête). Impact réel sur tout `lib/copy/*` qui porte la voix Sensei (`rituals.ts`, `combat.ts`, etc.) et sur `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`, qui doit être mis à jour (pas juste recadré — le point de vue change).
- **Boss — antagoniste interne.** Garde son franc-parler et ses piques (US-49, jauge d'agressivité), mais elles ne visent plus un rival externe — c'est le doute qui vient de toi qui te parle ("tu vas encore lâcher, comme d'habitude"). Le clin d'œil 4e mur du palier le plus cru (US-54) reste, recadré : ce n'est plus un rival de rue qui casse le 4e mur, c'est ta propre tête qui commente le jeu que tu es en train de jouer.

### 2.4 Jauge d'agressivité — renommage du palier 3

Le palier `street` (US-49/US-54) référence littéralement l'ancien concept ("rue"). Renommé **`cash`** — franc-parler brutal, direct, sans détour ; aucune référence résiduelle à la rue/au combat externe. `sensei`/`sparring` restent inchangés (mentor calme / partenaire d'entraînement — les deux fonctionnent aussi bien pour un dojo intérieur que pour un dojo de rue, aucune dissonance).

**Décision technique différée au plan** : renommer la valeur de type `AggressivityLevel` (`"sensei" | "sparring" | "street"` → `"cash"`) touche `types/index.ts`, `lib/aggressivity.ts`, 6 fichiers `lib/copy/*.ts` + leurs tests, `profiles.aggressivity_level` (colonne DB, migration de valeur pour les lignes existantes), et l'UI (`AggressivityLevelSection.tsx`). ~28 fichiers référencent `street`/`AggressivityLevel` au total (recensés par grep) — l'exécution exacte (migration SQL de valeur vs. mapping d'affichage seul) est un choix du plan d'implémentation, pas de ce document.

---

## 3. Récit — parcours utilisateur

### 3.1 Onboarding (le twist)

1. **Accroche** (`/welcome`) : introduire la prémisse avant même l'inscription — dans l'esprit de *"Ce qui traîne dans ta tête a un nom. Et une jauge de vie."* (texte exact à écrire en implémentation, pas figé ici).
2. **Pseudo** (`/onboarding`) : forme inchangée.
3. **Choix du héros** : *"Choisis ton corps de combat"* — inchangé dans la forme, le héros reste ton avatar physique.
4. **Premier tuto** (`ArenaCoach`, piloté par `profiles.has_seen_tutorial`) : reveal narratif explicite au moment de la 1ère tâche ajoutée — *"Regarde. Il vient de grandir. Tout ce qui traîne le nourrit. Finis-la, tu le vides."* La mécanique HP devient intuitive dès la première interaction au lieu de sembler arbitraire.

### 3.2 Boucle quotidienne

- **Rituel du Réveil** (US-08, ouverture) : révèle le masque du jour — *"Aujourd'hui, ce qui traîne dans ta tête porte le visage du [nom du boss]."* Traitement des restes (Terminé/Reporter/Annihiler) mécaniquement inchangé, copy recadrée.
- **Arène** : ajouter = nourrir, terminer = frapper — Sensei commente en voix intérieure tout du long (ajout de tâche, complétion, combo, level up).
- **Deadline ratée / Rage Quit** : le Boss chuchote un doute qui vient de toi, pas une menace d'un rival externe.
- **Rituel du Crépuscule** (US-07, clôture) : *"Aujourd'hui t'as vidé ta tête de X choses."*
- **Perfect/K.O. en direct** (US-16) : masque du jour intégralement effacé = tête vide ce soir. Perfect (Héros à 100 HP, aucun reste) = calme total, zéro reste nulle part.

### 3.3 Long terme

- **Streaks et titres de ceinture** (US-12, Ceinture Jaune/Noire/Sensei) : inchangés — une progression d'entraînement de soi est déjà exactement cohérente avec "Démon Intérieur", ne référence jamais un rang parmi des rivaux externes.
- **Panthéon** (US-10) : reste un journal de combats, recadré comme journal de tes combats contre toi-même plutôt que contre des rivaux.

---

## 4. Identité visuelle

### 4.1 Logo

`logo.svg` (actuellement non commité à la racine) devient `public/logo-source.svg` (ou équivalent — chemin exact à trancher en implémentation, cf. `scripts/generate-pwa-icons.mjs` qui lit déjà `public/icons/logo-source.svg`). Visuel : case à cocher pixel-art rouge, coche or qui sort du cadre façon lame/coup porté. Colle sans retouche au nouveau sens : le coup n'est pas porté à un ennemi extérieur, il transperce ta propre résistance/ce qui traîne.

**Action** : committer le fichier, le brancher comme source dans `scripts/generate-pwa-icons.mjs`, régénérer `app/favicon.ico` + `app/apple-icon.png` + `public/icons/*` (`npm run generate:icons`). Pas de nouveau design de logo à produire — celui-ci est validé.

### 4.2 Palette et système de design

Aucun changement à `DESIGN.md` (couleurs, typographie, composants) — le système visuel actuel sert aussi bien "Démon Intérieur" que "Dojo de Rue" ; seul le sens verbal autour change.

---

## 5. Documents impactés (à mettre à jour dans le plan)

| Fichier | Nature du changement |
|---|---|
| `PRODUCT.md` | Réécrire "Product Purpose" et "Brand Personality" autour du reframe (§2 de ce doc) |
| `DESIGN.md` | Aucun changement de fond ; noter le reframe narratif si pertinent en overview |
| `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md` | Réécriture (pas recadrage) — le point de vue du Sensei change (externe → intérieur) |
| `docs/superpowers/specs/2026-07-23-agressivite-copy-design.md` | Mise à jour du palier `street` → `cash`, recadrage du sens des piques du Boss |
| `lib/copy/*.ts` (+ tests) | Réécriture du contenu des pools de variantes (US-49/US-54) pour refléter voix intérieure Sensei + Boss antagoniste interne — détail exact scopé en plan |
| `types/index.ts`, `lib/aggressivity.ts` | Renommage valeur `street` → `cash` (cf. §2.4) |
| `ASSETS.md` | Ajouter une entrée pour `logo-source.svg` une fois committé/intégré au pipeline |
| `CLAUDE.md` | Nouvelle entrée "Pièges et décisions" documentant le reframe narratif comme décision de marque (pas un piège technique, mais un choix produit non-évident qui affecte tout futur texte "voix") |
| Onboarding (`app/welcome`, `app/onboarding/OnboardingFlow.tsx`, `ArenaCoach`) | Copy des étapes clés recadrée (§3.1) — pas de changement structurel d'écrans |

---

## 6. Risques et arbitrages assumés

- **Volume de réécriture de copy non-trivial** : voix Sensei en "voix intérieure" touche potentiellement tous les fichiers `lib/copy/*`, pas seulement les scénarios les plus visibles. Assumé — c'est le prix du changement de point de vue choisi en brainstorming (voix intérieure plutôt que mentor externe, option retenue explicitement).
- **Renommage `street` → `cash`** touche une donnée déjà en base (`profiles.aggressivity_level`) pour les profils existants ayant choisi ce palier — migration de valeur nécessaire, pas seulement un renommage de code. Détail d'exécution laissé au plan.
- **Aucun changement mécanique ni de palette** limite le risque de régression technique — cette passe est presque exclusivement une réécriture de contenu (texte) + un remplacement d'asset (logo), pas un refactor de code de jeu.
