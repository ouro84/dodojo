# Serveur MCP — couche domaine, scopes OAuth et catalogue de 10 tools

> Date : 2026-09-05
> Issue : #201
> Étend : US-22 (`docs/superpowers/specs/2026-07-22-us22-gemini-mcp-design.md`) — le serveur OAuth 2.1 + MCP livré par US-22 reste en place ; ce spec en élargit la surface (1 → 10 tools) et durcit son contrôle d'accès.
> N'invalide pas : US-03 (webhook Siri) — `lib/task-insertion.ts` continue de servir les deux appelants sans session cookie.

---

## Contexte

Le serveur MCP de Dodojo (`app/api/mcp/route.ts`, US-22) expose **un seul tool**, `add_task`. Il a été construit pour Gemini « Custom apps for Spark », produit indisponible en EEE (cf. issue #104, root cause côté Google) : il n'a donc **jamais** été exercé par un vrai client MCP.

Objectif : le rendre réellement utilisable par n'importe quel assistant IA (Claude Code, Claude Desktop, tout client MCP conforme), avec une surface qui permet de lire l'état du combat, de le faire avancer, et de régler quelques préférences.

### Le vrai coût n'est pas le câblage JSON-RPC

Aucune server action n'est réutilisable telle quelle. Toutes ouvrent sur `createClient()` (`lib/supabase/server.ts`) puis `supabase.auth.getUser()` — **cookie de session**. Le MCP n'a aucun cookie : client service-role + `userId` explicite résolu depuis le Bearer token.

Le patron cible existe déjà trois fois dans le repo (`insertTaskForUser`, `assembleAchievementContext`, `applyNewAchievements`) mais n'a jamais été généralisé. Le chantier est cette généralisation, pas l'ajout de tools.

### Périmètre validé avec l'utilisateur

- L'agent peut **lire, créer et cocher**. Pas d'accès à l'économie (achats), ni aux rituels (Réveil, clôture de journée).
- Le serveur est **ouvert à tout client MCP**, pas réservé à un usage perso — d'où des scopes réels, un consentement honnête et un rate limit autoritaire.
- Refacto en **couche domaine complète** (approche B). Une extraction incrémentale tool par tool (approche A) avait été proposée comme moins risquée et écartée en connaissance de cause : B laisse une architecture finale propre plutôt qu'un `app/actions/tasks.ts` à moitié wrapper. Le risque de régression est réel et dérisqué par l'ordre d'extraction (D1.3) et le filet de tests décrit plus bas, pas nié.

---

## D1 — Couche domaine `lib/domain/`

```
lib/domain/
├── tasks.ts        # ~850 lignes migrées depuis app/actions/tasks.ts (1007 lignes)
├── shop.ts         # equipHeroForUser
├── boss.ts         # readDailyBoss (lecture seule) + resolveDailyBoss
└── progression.ts  # niveau, xp, reste avant level up, solde d'or
```

Signature unique, sans exception :

```ts
export async function completeTaskForUser(
  supabase: SupabaseClient,   // @supabase/supabase-js — JAMAIS ReturnType<typeof createClient>
  userId: string,             // explicite — jamais supabase.auth.getUser() ici
  taskId: string,
  completed: boolean,
): Promise<CompleteTaskOutcome>
```

**Trois interdits dans `lib/domain/`** : pas de `"use server"`, pas de `revalidatePath`, pas de `supabase.auth.getUser()`. Ces trois gestes restent la responsabilité exclusive de l'appelant.

Les server actions deviennent des wrappers de ~8 lignes :

```ts
export async function setTaskCompleted(id: string, completed: boolean): Promise<TaskActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await completeTaskForUser(supabase, user.id, id, completed);
  revalidatePath("/");
  return outcome;
}
```

`app/actions/tasks.ts` passe de 1007 à ~200 lignes.

### D1.1 — La validation descend, les messages restent en surface

`UUID_RE` (garde d'intégrité contre l'injection de filtre PostgREST, audit #67 PR5) descend dans le domaine : le MCP en a exactement autant besoin que l'UI.

Les messages « voix » (`"Session expirée. Reconnecte-toi."`) restent dans les server actions. Le domaine renvoie des **codes**, l'appelant les habille — sinon le MCP servirait le tutoiement de La Voix à un agent, ce qui n'a aucun sens.

### D1.2 — Blocage de typage à corriger dans le même lot

`app/actions/achievements.ts:11` type son paramètre :

```ts
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
```

C'est précisément l'anti-patron que CLAUDE.md documente comme cassant `tsc --noEmit` (perte d'inférence sur `.insert()`, qui résout vers `never[]`). Un client **service-role** (`SupabaseClient` de `@supabase/supabase-js`) n'est pas assignable à ce type : `assembleAchievementContext` **ne compile pas** appelée depuis le MCP.

`achievements.ts` doit être re-typé sur `SupabaseClient` explicite. C'est un pré-requis bloquant de `completeTaskForUser`, pas un nettoyage optionnel.

### D1.3 — Ordre d'extraction

1. Re-typage d'`achievements.ts`
2. `completeTaskForUser` — la plus dure (XP, combo server-authoritative, verrouillage `hp_penalty`, cascade d'abandon, succès, détection K.O.). Si le patron tient sur elle, il tient sur tout ; si elle casse, on l'apprend au premier commit et pas au douzième.
3. Le reste de `tasks.ts` par familles : ajout, deadline, Réveil, demain
4. `shop.ts`, `boss.ts`, `progression.ts`

---

## D2 — Scopes OAuth

Quatre scopes, stockés espace-séparés dans la colonne `scope` existante (`text not null` sur `oauth_tokens` et `oauth_authorization_codes`). **Aucune migration sur cette colonne.**

| Scope | Couvre |
|---|---|
| `tasks:read` | tâches du jour, boss, streak, historique |
| `tasks:write` | créer, cocher, deadline, reporter à demain |
| `profile:read` | XP, niveau, reste avant level up, or, roster possédé |
| `profile:write` | changer le héros équipé |

**Requête `/oauth/authorize` sans `scope`** → accorde `tasks:read tasks:write`, jamais `profile:write`. Un client qui ne demande rien n'obtient pas le droit de modifier l'équipement.

**Scope inconnu** → refus affiché (page d'erreur), jamais un filtrage silencieux : un client qui croit avoir obtenu un droit qu'il n'a pas produit des erreurs incompréhensibles plus tard.

`scopes_supported` dans `/.well-known/oauth-protected-resource` passe de 1 à 4 valeurs.

### D2.1 — Tokens existants

Décision : **purge de `oauth_tokens` en production**, aucun token actif en pratique (Gemini n'a jamais pu se connecter, cf. #104). À **vérifier** par un `select count(*)` avant exécution, et à confirmer explicitement avec l'utilisateur — c'est une écriture destructive en prod. Le DELETE est légitime : les tables `oauth_*` portent volontairement une policy DELETE (données techniques opérationnelles, hors RG-04).

Aucune exception « legacy » n'est donc à maintenir dans le code de vérification de scope.

---

## D3 — Registry de tools

Nouveau fichier `lib/mcp-tools.ts`, à côté de `lib/mcp-protocol.ts` qui reste le cadre JSON-RPC pur.

```ts
export interface McpToolDef {
  tool: McpTool;                                   // name, description, inputSchema
  requiredScope: OAuthScope;
  parseArgs: (args: Record<string, unknown>) => ParsedArgs | { error: string };
  handler: (ctx: McpContext, args: ParsedArgs) => Promise<McpToolResult>;
}
export const TOOL_REGISTRY: readonly McpToolDef[];
```

`McpContext = { supabase, userId, timezone }` — résolu **une fois par requête** dans le route handler, jamais reconstruit par tool.

`parseArgs` explicite par tool plutôt qu'un validateur générique dérivé du `inputSchema` : pas de nouvelle dépendance (cohérent avec les refus passés de `@vercel/og` et du SDK Notion), et chaque parseur est testable en Vitest sans base.

`handleToolsCall` perd sa chaîne de `if` : lookup registry → contrôle de scope → `parseArgs` → `handler`. ~25 lignes au lieu d'une cascade qui grossit de 15 lignes par tool.

### D3.1 — `tools/list` filtre selon le scope du token

Un agent ne doit pas voir des tools qu'il ne peut pas appeler : il les tenterait, échouerait, et brûlerait des tours. Le refus de scope reste servi **en plus** en JSON-RPC in-band (message lisible), jamais en HTTP 403 qui couperait le dialogue.

---

## D4 — Rate limit autoritaire en base

### Le piège qui invalide la solution évidente

`handleRefreshTokenGrant` (`app/oauth/token/route.ts`) **supprime la ligne `oauth_tokens`** à chaque rotation. Un compteur stocké sur cette table serait donc remis à zéro par un simple `grant_type=refresh_token` — contournable en une requête. Le compteur doit vivre dans une table séparée, clé `user_id`.

### Table + fonction atomique

```sql
create table public.mcp_rate_limit (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count int not null default 0
);
-- consume_mcp_quota(p_user_id uuid, p_limit int, p_window_seconds int) returns boolean
-- Un seul aller-retour, atomique (évite la course lecture-puis-écriture),
-- reset de la fenêtre inclus.
```

RLS activée, **aucune policy** : service-role exclusivement, même patron que l'écriture sur `oauth_tokens`.

### Défense en profondeur, dans cet ordre

1. Garde IP en mémoire (`lib/rate-limit.ts` existant), **60 requêtes / minute / IP** — gratuite, filtre le martèlement anonyme **avant** toute requête Supabase
2. Résolution du Bearer token
3. `consume_mcp_quota`, **120 requêtes / minute / utilisateur** — autoritaire, multi-instance, un RPC par appel MCP authentifié

Le quota par utilisateur est plus large que la garde IP : plusieurs clients MCP légitimes peuvent partager un compte (poste fixe, portable, téléphone) derrière des IP différentes. Ces deux valeurs sont un point de départ à réviser si un usage réel les frôle — un agent qui enchaîne `list_tasks` puis dix `complete_task` reste très loin du plafond.

La limite en mémoire reste best-effort par nature (ne survit pas à un cold start, pas partagée entre instances Vercel) : c'est un pré-filtre, pas le rempart.

---

## D5 — Écran de consentement piloté par les scopes

`renderConsentPage` (`lib/oauth-consent-page.ts`) reçoit les scopes accordés et les affiche en clair, une ligne par droit :

> **Claude veut accéder à ton compte Dodojo**
> · Lire tes tâches, ton Boss et ta série
> · Créer et cocher des tâches
> · Voir ta progression
> · Changer ton combattant équipé

Le titre codé en dur « veut ajouter des taches a ta place » disparaît. L'avertissement existant sur l'identité non vérifiée du client **reste** — il est juste, et il compte davantage maintenant que l'endpoint est ouvert à tout client.

Correction annexe : le HTML actuel est écrit sans accents (« taches », « Portee ») alors qu'il déclare `charset=utf-8`. Le bloc est réécrit de toute façon.

---

## D6 — Catalogue : 10 tools

Principe de découpe : **moins de tools, mieux paramétrés**. Un agent choisit mal entre douze noms proches ; `add_task` avec un `parent_id` optionnel bat `add_task` + `add_subtask` séparés.

| Tool | Scope | Args | Retour |
|---|---|---|---|
| `list_tasks` | `tasks:read` | `day?` (`today`\|`tomorrow`), `include_completed?` | Hiérarchie triée (`sortTasksHierarchically`) : id, titre, état, sous-tâches, deadline, indicateur « en retard » |
| `get_boss_status` | `tasks:read` | — | Nom, lore, `currentHp`/`maxHp`, tâches restantes — ou `not_drawn_yet` |
| `get_streak` | `tasks:read` | — | `{ length, jokersUsedThisWeek, atRisk }` (`currentStreak`) |
| `get_progression` | `profile:read` | — | Niveau, XP, XP restante (`xpThresholdForLevel`), or (`goldBalance`) |
| `list_heroes` | `profile:read` | — | id, nom, possédé, équipé |
| `add_task` | `tasks:write` | `title`, `parent_id?`, `day?` | id créé, HP du Boss après ajout |
| `complete_task` | `tasks:write` | `task_id`, `completed?` (défaut `true`) | HP du Boss, XP gagnée, combo atteint, K.O. oui/non |
| `set_deadline` | `tasks:write` | `task_id`, `deadline_at` (ISO ou `null`), `reminder_enabled?`, `reminder_offset_minutes?` | confirmation + heure locale résolue |
| `move_task` | `tasks:write` | `task_id`, `to` (`today`\|`tomorrow`) | confirmation |
| `equip_hero` | `profile:write` | `hero_id` | confirmation |

- `add_task` couvre la sous-tâche via `parent_id` : le handler dispatche vers `addSubtaskForUser`, qui porte la garde RG-01 (profondeur 2) et l'héritage du `day_date` du parent.
- `move_task` fusionne `reportToTomorrow` et `bringToToday` — même geste, deux directions.
- `list_heroes` existe pour que `equip_hero` soit appelable : sans lui l'agent n'a aucun moyen de connaître un `hero_id` valide.

### D6.1 — `get_boss_status` ne tire jamais le boss

`resolveDailyBoss()` n'est pas un getter : il **upsert `daily_boss`** si le tirage du jour n'a pas eu lieu, puis évalue les succès (`assembleAchievementContext` + `applyNewAchievements`, ~8 requêtes). Un agent qui « regarde le boss » à 3 h du matin figerait le boss de la journée et pourrait débloquer des succès sans que l'utilisateur ait ouvert l'app.

`readDailyBoss` (`lib/domain/boss.ts`) lit la ligne et renvoie `not_drawn_yet` si elle n'existe pas. Le MCP n'appelle **jamais** `resolveDailyBoss`.

### D6.2 — Retours en texte seul

La révision `2025-06-18` annoncée par le serveur supporte `structuredContent` + `outputSchema`. On ne l'utilise pas en v1 : ça impose un schéma de sortie par tool, le support client est inégal, et la spec exige de toute façon un fallback texte — on écrirait deux fois la même chose. Texte compact et cadré, comme le fait déjà `buildAddTaskToolResult`. Suite possible, pas un manque.

### D6.3 — Contrat d'erreur

Toute erreur métier sort en `isError: true` avec un code machine plus un message court (`task_not_found`, `depth_limit`, `hero_not_owned`, `rate_limited`).

Les erreurs JSON-RPC (`-32601`, `-32602`, `-32603`) restent réservées au protocole : méthode inconnue, requête malformée. Un tool qui échoue pour une raison métier n'est pas une panne de transport — un agent qui reçoit un `-32603` conclut que le serveur est cassé et abandonne.

---

## Hors scope, avec les raisons

| Exclu | Raison |
|---|---|
| Achat de héros / tenues | Dépense d'or déclenchée par un agent |
| « Terminer la journée » | Écrit `day_results` ; cérémonie qui doit rester un geste humain |
| Actions du Réveil (reporter / annihiler un reste) | L'overlay est bloquant **par design** ; un agent qui solde les restes en douce vide le rituel de son sens |
| `rage_quit` | Punitif (−5 XP), très mauvais candidat pour une commande vocale mal comprise |
| Routines (`recurring_templates`) | Décision explicite, pas un oubli : meilleur candidat v2, mais tire 348 lignes de `app/actions/recurring.ts` dans un lot déjà lourd |
| `structuredContent` MCP | Cf. D6.2 |
| Realtime / polling de l'Arène | Cf. limite assumée ci-dessous |

---

## Limite assumée

**Aucune écriture MCP n'est visible dans une Arène déjà ouverte.** `revalidatePath` n'atteint jamais un state client hydraté — c'est le bug prod #70, documenté dans CLAUDE.md. L'agent coche une tâche, le Boss perd ses HP en base, l'écran de l'utilisateur ne bouge pas jusqu'au rechargement.

Corriger ça demanderait du polling ou du realtime Supabase dans `Arena.tsx` : hors scope. À documenter dans Le Guide, pour que le comportement soit compris comme une limite connue et non comme un bug.

---

## Tests

### Vitest

Règle unique de validation de la refacto : **`app/actions/tasks.test.ts` (701 lignes) doit rester vert sans qu'une seule ligne de test ne bouge.** Un test qu'il faut retoucher signale un changement de comportement, pas un déplacement — on annule et on recommence.

Nouveaux fichiers :
- `lib/domain/*.test.ts` — reprend les cas de `tasks.test.ts` en attaquant le domaine directement, avec un faux client Supabase (patron `FakeQueryBuilder`, déjà présent dans `app/oauth/token/route.test.ts` et `app/api/mcp/route.test.ts`)
- `lib/mcp-tools.test.ts` — un cas par `parseArgs` (argument manquant, mauvais type, valeur hors bornes) + filtrage de `tools/list` par scope
- `lib/oauth-scopes.test.ts` — parsing, scope inconnu refusé, absence de scope → `tasks:read tasks:write` et jamais `profile:write`

Les fichiers `lib/domain/*` peuvent importer via l'alias `@/` : `vitest.config.ts` porte bien `resolve.alias` depuis US-20. La note CLAUDE.md imposant des imports relatifs pour tout fichier chargé directement par un test est **périmée** et doit être corrigée dans le même lot.

### E2E Playwright

`e2e/mcp-oauth.spec.ts`, nouveau. Le handshake complet n'a **jamais** été testé bout-en-bout (US-22 est partie en prod sans, faute de client réel) :

1. `POST /oauth/register` → `client_id`
2. Navigation vers `/oauth/authorize` avec un PKCE généré dans le test, login du compte e2e du worker courant, clic « Autoriser »
3. Capture du `code` sur le `redirect_uri` loopback
4. `POST /oauth/token` → `access_token`
5. `tools/list` → vérifie le filtrage par scope
6. `add_task` puis `list_tasks` → la tâche créée par MCP est visible
7. Un tool hors scope → `isError`, jamais un 500

Couvre en une passe ce qui n'avait aucune garde : PKCE, usage unique du code, rotation du refresh, contrôle de scope.

### Extension obligatoire de `purgeE2eAccountState`

`purgeE2eAccountState` (`e2e/fixtures.ts:132`) doit absorber quatre tables de plus : `oauth_tokens`, `oauth_authorization_codes`, `mcp_rate_limit`, et surtout `oauth_clients`.

**`oauth_clients` n'a pas de colonne `user_id`** — les clients enregistrés par les runs e2e s'accumulent globalement, hors de toute purge par compte. C'est exactement le mécanisme qui a produit les 26 `recurring_templates` fantômes et les ~480 HP de Boss avant qu'un test ne commence. Nettoyage par préfixe de `client_name` (`e2e-*`), le spec enregistrant ses clients sous ce préfixe.

Le quota `mcp_rate_limit` doit également être remis à zéro dans la purge : sans ça, un run complet finit par se rate-limiter lui-même — un échec qui ressemblerait à un bug applicatif.

---

## Migration

Un seul fichier : `20260905HHMMSS_create_mcp_rate_limit.sql` — table `mcp_rate_limit`, fonction `consume_mcp_quota`, RLS activée sans policy.

Timestamp strictement postérieur à `20260810210000` (dernière migration sur `main` au 2026-09-05). `npx supabase migration list --linked` **avant le merge**, colonnes Local vs Remote comparées : le refus silencieux des migrations hors-ordre a déjà coûté plusieurs jours de bugs prod invisibles.

---

## Documentation à produire dans les mêmes commits

- **`CHANGELOG.md`** — une ligne sous `[Unreleased]` par PR
- **`CLAUDE.md`** — convention de la couche domaine (`SupabaseClient` explicite, jamais `ReturnType<typeof createClient>`) ; piège du compteur détruit par la rotation de token ; extension de `purgeE2eAccountState` ; **suppression** de la note périmée sur les imports relatifs en Vitest
- **Le Guide** — feature visible par l'utilisateur : nouvel article Notion « Brancher un assistant IA » (base « Guide Dodojo », `Statut = Publié`), puis `npm run pull:guide`. Vérifier d'abord qu'aucun article ne couvre déjà Siri/Gemini — auquel cas c'est une mise à jour et le `Slug` ne bouge pas
- **Issue #201** — les 4 lots y sont en cases à cocher, à cocher au fil des merges

---

## Ordre de livraison

| PR | Contenu | Critère de sortie |
|---|---|---|
| **1** | Couche domaine `lib/domain/` + re-typage d'`achievements.ts`. Zéro nouveau tool, zéro changement de comportement | `tasks.test.ts` vert **sans modification**, suite e2e complète verte |
| **2** | Socle MCP : registry, scopes, consentement, rate limit + migration. `add_task` seul, migré | `e2e/mcp-oauth.spec.ts` vert |
| **3** | Les 5 tools de lecture | Suite verte |
| **4** | Les 5 tools d'écriture | Suite verte |

PR1 est le seul risque réel du chantier et ne livre rien de visible — c'est voulu : si la refacto casse quelque chose, on l'apprend sur un diff qui ne mélange aucune fonctionnalité nouvelle.

Baseline verte obligatoire **avant** le premier déplacement de code : `npm run test`, `tsc --noEmit`, `npm run build`, suite e2e complète, avec le temps de la suite noté pour détecter une dérive.
