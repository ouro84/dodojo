# Design — "Le Démon Intérieur" : refonte identité/ton/récit (issue #51)

> Date : 2026-07-24
> Issue : #51 ("PWA et product marketing" — scope réduit à la passe identité visuelle/produit marketing seule, PWA extraite en #58 lors du cadrage Sprint 3)
> Statut : validé en brainstorming, prêt pour planification

---

## 1. Contexte et portée

Le concept narratif actuel ("Dojo de Rue", vibe Ryu/Ken/Street Fighter, Sensei mentor externe + Boss rival) est documenté dans `PRODUCT.md` et `DESIGN.md`. Ce document ne le corrige pas en surface : il **remplace le sens** que porte la mécanique de jeu existante, sans toucher à la mécanique elle-même — et va plus loin qu'un simple recadrage de sens : le vocabulaire japonais/martial-arts ("Sensei", "Dojo", "Ceinture", "Rituel", "Sparring") est identifié comme un vernis externe plaqué, incohérent avec un concept désormais intime, et **remplacé** par un lexique propre à Dodojo (cf. §3bis).

**Fixe (non négociable, validé en amont)** :
- Mécanique de jeu : Boss du jour, HP/XP, tâche ajoutée = +20 HP Boss, tâche terminée = dégâts, héros/streaks/or/roster de 12 boss/décors — tout `lib/game-engine.ts` reste inchangé (à l'exception des chaînes de caractères retournées par `titleForStreak`, cf. §3bis).
- Palette visuelle (`DESIGN.md`) : rouge combat/indigo néon/or reste juste, aucune raison esthétique de la changer.
- Nom de l'app : **Dodojo** reste — la seule trace de "dojo" conservée dans tout le vocabulaire, en tant que nom propre déjà installé (pas un mot commun réutilisé ailleurs).
- Le mot **"Boss"** reste tel quel — vocabulaire gaming universel, pas japonais/martial-arts, fonctionne aussi bien pour désigner ce qui traîne dans la tête qu'un rival externe.
- Les termes gaming/arcade universels (**K.O.**, **Perfect**, **Combo**, **Rage Quit**, **Héros**) restent inchangés — ce ne sont pas des emprunts japonais/dojo, ils appartiennent au registre "borne d'arcade" que `PRODUCT.md`/`DESIGN.md` revendiquent explicitement (anti-références Notion/Linear, pas anti-arcade).

**Ouvert et retravaillé ici** : l'univers fictionnel, le sens des personnages (Boss/Voix/Héros), le ton, l'onboarding narratif, le nommage des écrans/rituels/titres/jauge, le logo/identité visuelle qui en découle.

**Hors scope** : PWA (#58), toute mécanique de jeu nouvelle, copy orientée extérieur (tagline store, landing page marketing) — cette passe produit une mise à jour de la documentation de marque interne (`PRODUCT.md`, `DESIGN.md`, specs de ton) et l'intégration du nouveau logo dans le pipeline d'assets existant. La réécriture effective de tous les fichiers `lib/copy/*` sera scopée dans le plan d'implémentation, pas détaillée texte par texte ici.

---

## 2. Le reframe : "Le Démon Intérieur"

**Ancien sens** : tu es un élève de dojo qui se bat dans la rue contre un rival (le Boss), un Sensei externe commente ton combat.

**Nouveau sens** : le Boss n'est pas un rival extérieur. C'est **tout ce qui traîne encore, non tranché, dans ta tête** — la charge mentale elle-même, rendue visible et combattable. La voix qui commente ton combat n'est plus un mentor externe : c'est **ta propre discipline, ta Voix**, qui te parle depuis l'intérieur. Tu ne gagnes pas un combat contre un ennemi extérieur — tu vides ta tête.

### 2.1 Le lien HP/tâche (le fil narratif validé)

Le Boss grandit quand tu ajoutes une tâche, rétrécit quand tu la termines — mécanique déjà en place, jusqu'ici non-justifiée narrativement (pourquoi "soigner" un ennemi en ajoutant une tâche ?). Nouveau sens : **chaque tâche ajoutée est un truc de plus qui traîne, non résolu, qui le nourrit ; chaque tâche terminée est un truc de moins dans ta tête, il rétrécit.** Ce n'est pas ta faiblesse qui grandit (pas culpabilisant), c'est la pile de choses non réglées — un fait neutre, pas un jugement de caractère.

### 2.2 Les masques quotidiens

Le roster de 12 monstres déjà intégré (Frost Guardian, Demon Slime, Cthulhu, Mino, low-boss...) devient littéralement **les masques que porte ce qui traîne dans ta tête**. Un jour ton "reste à faire" a la tête d'un golem de glace, un autre celle d'un slime — jamais deux jours de suite le même visage (déjà garanti par `pickDailyBoss`, exclusion des 2 derniers jours), mais toujours la même chose en dessous. Aucun changement technique : le tirage aléatoire existant (`resolveDailyBoss`, table `daily_boss`) illustre déjà exactement ce que raconte ce reframe. Seule la copy qui introduit le Boss du jour (Réveil, Arène) change de sens.

### 2.3 Les voix

- **La Voix** (remplace "Sensei" comme voix intérieure) — ta propre discipline qui te parle depuis l'intérieur, sans nom de personnage à retenir. Change de point de vue : pas "je t'ai vu progresser" (regard extérieur) mais "je sens qu'on avance" (même corps, même tête). Impact réel sur tout `lib/copy/*` qui porte cette voix (`rituals.ts`, `combat.ts`, etc.) et sur `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`, qui doit être réécrit (pas juste recadré — le point de vue change, et le nom du personnage change).
- **Boss — antagoniste interne.** Garde son franc-parler et ses piques, mais elles ne visent plus un rival externe — c'est le doute qui vient de toi qui te parle ("tu vas encore lâcher, comme d'habitude"). Le clin d'œil 4e mur du palier le plus cru (US-54) reste, recadré : ce n'est plus un rival de rue qui casse le 4e mur, c'est ta propre tête qui commente le jeu que tu es en train de jouer.

---

## 3. Récit — parcours utilisateur

### 3.1 Onboarding (le twist)

1. **Accroche** (`/welcome`) : introduire la prémisse avant même l'inscription — dans l'esprit de *"Ce qui traîne dans ta tête a un nom. Et des HP..."* (texte exact à écrire en implémentation, pas figé ici).
2. **Pseudo** (`/onboarding`) : forme inchangée.
3. **Choix du héros** : *"Choisis ton avatar"* — inchangé dans la forme, le héros reste ton avatar physique.
4. **Réglage du Volume Intérieur** (cf. §3bis) : palier par défaut Direct, choix Doux/Direct/Brut — écran déjà existant, copy et libellés à mettre à jour avec le nouveau lexique.
5. **Premier tuto** (`ArenaCoach`, piloté par `profiles.has_seen_tutorial`) : reveal narratif explicite au moment de la 1ère tâche ajoutée — *"Regarde. Il vient de grandir. Tout ce qui traîne le nourrit. Finis-la pour t'en débarrasser."* La mécanique HP devient intuitive dès la première interaction au lieu de sembler arbitraire.

### 3.2 Boucle quotidienne

- **Le Réveil** (ex-"Rituel du Réveil", US-08, ouverture) : révèle le masque du jour — *"Aujourd'hui, ce qui traîne dans ta tête porte le visage du [nom du boss]."* Traitement des restes (Terminé/Reporter/Annihiler) mécaniquement inchangé, copy recadrée.
- **Arène** : nom d'écran inchangé (option jugée correcte telle quelle en brainstorming, pas de remplacement nécessaire). Ajouter reste "Ajouter", Terminer reste "Terminer" dans l'UI — seule la narration autour (la Voix qui commente) change de sens, jamais le libellé des actions elles-mêmes.
- **Deadline ratée / Rage Quit** : le Boss chuchote un doute qui vient de toi, pas une menace d'un rival externe.
- **Dernier Round** (ex-"Rituel du Crépuscule", US-07, clôture) : *"Aujourd'hui t'as vidé ta tête de X choses."*
- **Perfect/K.O. en direct** (US-16) : masque du jour intégralement effacé = tête vide ce soir. Perfect (Héros à 100 HP, aucun reste) = calme total, zéro reste nulle part.

### 3.3 Long terme

- **Titres de streak** (US-12) : Calme / Silence / Esprit Vide (cf. §3bis) — une progression de clarté mentale croissante, déjà cohérente avec "vider ta tête".
- **Tableau de Chasse** (ex-"Panthéon", US-10) : ton historique de combats contre toi-même — idiome français gouailleur (registre de victoires), pas de grandiloquence externe.
- **Le Vestiaire** (ex-"QG", profil) : là où tu regardes ton palmarès entre deux combats — sportif, pas bureaucratique/militaire.
- **Le Marché Noir** (ex-"Échoppe", shop des héros) : ton franc-parler/gouailleur, cohérent avec la marque jamais corporate.
- **Le Guide** (ex-"Manuel du Dojo", aide) : simple, drop "Dojo", déjà le nom de la route `/guide`.

---

## 3bis. Lexique complet — table de correspondance

| Concept | Ancien nom | Nouveau nom |
|---|---|---|
| Écran combat | Arène | **Arène** (inchangé) |
| Écran profil | QG | **Le Vestiaire** |
| Écran shop | Échoppe | **Le Marché Noir** |
| Écran historique | Panthéon | **Tableau de Chasse** |
| Écran aide | Manuel du Dojo | **Le Guide** |
| Ouverture du jour (US-08) | Rituel du Réveil | **Le Réveil** |
| Clôture du jour (US-07) | Rituel du Crépuscule | **Dernier Round** |
| Titre streak 7j | Ceinture Jaune | **Calme** |
| Titre streak 30j | Ceinture Noire | **Silence** |
| Titre streak 100j | Sensei | **Esprit Vide** |
| Jauge d'agressivité (US-49) | Dojo Gauge | **Volume Intérieur** |
| Palier 1 (calme/zen) | Sensei | **Doux** |
| Palier 2 (équilibré, défaut) | Sparring | **Direct** |
| Palier 3 (cru/sans filtre) | Street | **Brut** |
| Voix intérieure/mentor | Sensei | **La Voix** |
| Antagoniste quotidien | Boss | Boss (inchangé) |
| Avatar joueur | Héros | Héros (inchangé) |

**Type `AggressivityLevel`** (`types/index.ts`) : `"sensei" | "sparring" | "street"` → `"doux" | "direct" | "brut"` (valeurs internes renommées en cohérence avec les libellés, pas seulement l'affichage — cf. §5 pour la migration de données).

---

## 4. Identité visuelle

### 4.1 Logo

`logo.svg` (actuellement non commité à la racine) devient `public/logo-source.svg` (ou équivalent — chemin exact à trancher en implémentation, cf. `scripts/generate-pwa-icons.mjs` qui lit déjà `public/icons/logo-source.svg`). Visuel : case à cocher pixel-art rouge, coche or qui sort du cadre façon lame/coup porté. Colle sans retouche au nouveau sens : le coup n'est pas porté à un ennemi extérieur, il transperce ta propre résistance/ce qui traîne.

**Action** : committer le fichier, le brancher comme source dans `scripts/generate-pwa-icons.mjs`, régénérer `app/favicon.ico` + `app/apple-icon.png` + `public/icons/*` (`npm run generate:icons`). Pas de nouveau design de logo à produire — celui-ci est validé.

### 4.2 Palette et système de design

Aucun changement à `DESIGN.md` (couleurs, typographie, composants) — le système visuel actuel sert aussi bien "Démon Intérieur" que "Dojo de Rue" ; seul le sens verbal autour change.

---

## 5. Documents et code impactés (à mettre à jour dans le plan)

Recensement issu d'un audit direct du code (grep + lecture des fichiers concernés) — ~131 fichiers référencent au moins un des mots du lexique §3bis, dont les principaux :

| Fichier / zone | Nature du changement |
|---|---|
| `PRODUCT.md` | Réécrire "Product Purpose" et "Brand Personality" autour du reframe (§2) |
| `DESIGN.md` | Aucun changement de fond ; noter le reframe narratif si pertinent en overview |
| `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md` | Réécriture complète — personnage "Sensei" → "La Voix", point de vue externe → intérieur |
| `docs/superpowers/specs/2026-07-23-agressivite-copy-design.md` | Mise à jour complète des 3 paliers (Doux/Direct/Brut) et du nom de la jauge |
| `lib/copy/*.ts` (+ tests) | Réécriture du contenu des pools de variantes (US-49/US-54) pour refléter La Voix + Boss antagoniste interne — détail exact scopé en plan |
| `types/index.ts`, `lib/aggressivity.ts` | Renommage des valeurs `AggressivityLevel` (cf. §3bis) |
| `lib/game-engine.ts` (`titleForStreak`) | Chaînes retournées : `"Calme"` / `"Silence"` / `"Esprit Vide"` au lieu de `"Ceinture Jaune"` / `"Ceinture Noire"` / `"Sensei"` |
| `app/pantheon/page.tsx` | Renommage d'écran (Tableau de Chasse) + `TITLE_TIERS` mis à jour avec les nouveaux titres |
| `app/qg/page.tsx`, route `/qg` | Renommage d'écran (Le Vestiaire) — chemin de route à trancher en plan (garder `/qg` ou renommer l'URL aussi) |
| `app/echoppe/page.tsx`, route `/echoppe` | Renommage d'écran (Le Marché Noir) — idem question de route |
| `app/guide/page.tsx`, `app/guide/[slug]/page.tsx` | Titres de page/metadata "Manuel du Dojo" → "Le Guide" |
| `components/combat/WakeUpRitual.tsx` | `aria-label`/titre "Rituel du Réveil" → "Le Réveil" |
| `components/combat/CrepusculeRecap.tsx`, `components/combat/Arena.tsx`, `components/combat/PerfectOverlay.tsx` | "Rituel du Crépuscule" → "Dernier Round" (CTA, aria-label) |
| `components/qg/AggressivityLevelSection.tsx`, `app/onboarding/OnboardingFlow.tsx` | Libellés "Dojo Gauge"/"Sensei"/"Sparring"/"Street" → "Volume Intérieur"/"Doux"/"Direct"/"Brut" |
| `components/combat/StreakBadge.tsx` | Pas de string dojo directe, mais pointe vers `/guide/streak` (contenu à réécrire) |
| `content/guide/streak.md`, `content/guide/agressivite.md`, `content/guide/reveil.md`, `content/guide/crepuscule.md`, `content/guide/index.json` | Réécriture des articles concernés (titres + corps) avec le nouveau lexique |
| `ASSETS.md` | Ajouter une entrée pour `logo-source.svg` une fois committé/intégré au pipeline |
| `CLAUDE.md` | Nouvelle entrée "Pièges et décisions" documentant le reframe + le lexique comme décision de marque |
| `e2e/dojo-gauge.spec.ts`, `e2e/wake-up-ritual.spec.ts`, `e2e/crepuscule-recap.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/guide.spec.ts` | Assertions sur libellés/`aria-label` à mettre à jour avec le nouveau lexique (renommage de fichier de test à évaluer pour `dojo-gauge.spec.ts`) |
| Migration Supabase | Migration de valeur pour `profiles.aggressivity_level` (lignes existantes `sensei`/`sparring`/`street` → `doux`/`direct`/`brut`) et pour `profiles.current_title` (lignes existantes `Ceinture Jaune`/`Ceinture Noire`/`Sensei` → `Calme`/`Silence`/`Esprit Vide`) |

---

## 6. Risques et arbitrages assumés

- **Volume de réécriture non-trivial, plus large qu'un simple recadrage.** Ce qui a commencé comme "changer le sens de Sensei/Boss" est devenu un renommage de vocabulaire à l'échelle de l'app entière (écrans, rituels, titres, jauge, voix) — ~131 fichiers touchés par au moins une occurrence des mots concernés (code, tests, contenu guide, docs). Assumé explicitement par l'utilisateur en cours de brainstorming : le vernis "dojo/japonais" devait sauter partout, pas seulement dans le sens narratif.
- **Deux migrations de données** (`profiles.aggressivity_level`, `profiles.current_title`) sont nécessaires pour les profils existants ayant déjà une valeur dans l'ancien vocabulaire — pas seulement un renommage de code/copy. Détail d'exécution (migration SQL de valeur vs. mapping de compatibilité) laissé au plan.
- **Tests e2e à mettre à jour dans la même PR que le renommage** (pas après coup) — plusieurs specs asserent sur des `aria-label`/libellés exacts qui changent (cf. §5). Risque de CI rouge si le renommage code/copy est fait sans synchroniser les tests.
- **Question ouverte pour le plan** : les routes elles-mêmes (`/qg`, `/echoppe`, `/pantheon`) gardent-elles leurs chemins d'URL techniques (recommandé — éviter de casser les liens existants/deep-links, seul le libellé affiché change) ou sont-elles renommées aussi ? Ce document recommande de **garder les routes techniques inchangées** et de ne renommer que les libellés visibles (nav, titres, aria-labels) — cohérent avec le principe déjà appliqué aux slugs du Guide ("Slug stable une fois publié").
- **Aucun changement mécanique ni de palette** limite le risque de régression technique côté jeu — cette passe reste une réécriture de contenu (texte/libellés) + un remplacement d'asset (logo) + deux migrations de valeur, jamais un refactor de logique de jeu.
