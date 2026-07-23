# PWA installable — socle Sprint 3 (design)

> Date : 2026-07-22
> Statut : validé pour passage en plan d'implémentation
> Issue : #58 (scindée de #51 — la passe identité visuelle reste sur #51)

## Périmètre

Rendre Dodojo installable (manifest + icônes) avec un service worker minimal
assurant :
1. Un cache d'app-shell basique (offline fallback léger).
2. Le socle technique nécessaire à US-11 (Web Push — iOS n'autorise le Web Push
   que sur un site "ajouté à l'écran d'accueil" depuis 16.4+). Les listeners `push`
   eux-mêmes seront ajoutés dans le cycle propre de US-11, pas ici.

Pas de refonte d'identité visuelle ici (voir #51, hors scope).

---

## Manifest

`app/manifest.ts` (convention native Next.js 16, route générée, cachée par défaut).
Champs : `name`/`short_name` ("Dodojo"), `display: "standalone"`, `start_url: "/"`,
`theme_color`/`background_color` alignés sur les tokens Tailwind déjà utilisés dans
l'app (ex. `bg-surface`) plutôt qu'une couleur inventée — valeur exacte à résoudre
en plan une fois `DESIGN.md` figé (palette actuellement en seed, `[valeurs hex/OKLCH
à résoudre à l'implémentation]`).

**Icônes** : source = `logo.svg` (actuellement à la racine, non tracké, à déplacer
dans `public/icons/`). **Prérequis avant dérivation des tailles PNG** : le logo doit
être nettoyé/décliné en plusieurs coloris (variante claire/sombre) et une variante
**maskable Android** (zone de sécurité respectée pour le crop adaptatif, cf. spec
maskable icons) — potentiellement une variante monochrome pour les icônes thématisées
Android (Material You). Ce travail de déclinaison d'asset est un prérequis distinct,
à traiter avant ou en tout début du plan d'implémentation, pas une "amélioration" de
ce design.

Tailles requises : 192×192 et 512×512 minimum (+ variante `purpose: "maskable"`).

---

## Service worker — Serwist

Choix : **Serwist** (successeur maintenu de `next-pwa`, intégration App Router
native) plutôt qu'un service worker écrit à la main — gère le precache versionné par
build (invalidation automatique à chaque déploiement Vercel) et fournit des
stratégies de cache Workbox prêtes à l'emploi, réutilisables telles quelles pour les
futurs listeners `push` de US-11.

**Precache (app-shell uniquement)** : JS/CSS générés par le build, police pixel,
manifest. Pas les sprites.

**Runtime caching (à la demande)** : les sprites (12 boss × dizaines de frames +
décors + héros) sont mis en cache au fur et à mesure qu'ils sont vus par
l'utilisateur (stratégie cache-first ou stale-while-revalidate), **pas** précachés
en bloc à l'installation — éviterait un téléchargement initial massif alors que
l'utilisateur ne verra jamais la plupart des 12 boss (roster tiré aléatoirement,
2 derniers jours exclus).

---

## Offline fallback — portée réaliste

Dodojo est une app server-driven (Supabase, server actions, pas de couche de
données locale/offline-first). Le cache d'app-shell **ne rend pas l'app utilisable
hors-ligne** pour la logique de jeu (ajouter/cocher une tâche reste impossible sans
réseau). La portée réelle de "l'offline fallback" ici :
- L'app-shell (JS/CSS/police) se charge instantanément même en réseau capricieux
  (déjà en cache), donnant une impression de rapidité.
- Si la navigation échoue réellement hors-ligne (pas de réseau du tout), une page
  de fallback légère et cohérente avec le ton du jeu ("Le Dojo est hors ligne...")
  s'affiche plutôt qu'une erreur de navigateur générique.

Pas de synchronisation différée ni de file d'actions en attente — hors scope,
non demandé.

---

## Mise à jour du service worker (amélioration retenue)

`main` se déploie automatiquement à chaque merge (convention du projet) — sans
gestion explicite du cycle de vie du SW, les utilisateurs restent bloqués sur un
app-shell caché périmé jusqu'au prochain rechargement complet. Pas cosmétique :
détection d'un SW "waiting" (nouvelle version prête) → toast "Nouvelle version
disponible, recharger ?" → `skipWaiting()` + reload au clic. Serwist expose les
hooks nécessaires pour ça côté client.

## Installation — CTA maison (amélioration retenue)

Capture de l'événement `beforeinstallprompt` (Chrome/Android) pour proposer un
bouton d'installation intégré au ton pixel-art de l'app (QG) plutôt que de dépendre
uniquement du bandeau générique du navigateur. Sur iOS (pas de
`beforeinstallprompt`), pas de solution équivalente — instructions manuelles
("Partager → Sur l'écran d'accueil") documentées dans le Manuel du Dojo.

---

## Tests

- Pas de test Vitest spécifique (config Serwist + manifest, peu de logique pure
  à isoler).
- Vérification manuelle post-implémentation : Lighthouse PWA audit (installable,
  manifest valide, service worker actif), test d'installation réelle sur un
  appareil (icône, splash screen, `display: standalone`).
- Pas de test e2e Playwright sur l'installation PWA (hors capacité réaliste de
  Playwright en CI pour ce genre de vérification navigateur/OS).
