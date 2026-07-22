# US-20 — Partage de victoires (design)

> Date : 2026-07-22
> Statut : validé pour passage en plan d'implémentation

## Contexte — cadrage Sprint 3

Le registre (`SPECS_FONCTIONNELLES.md`) liste 6 US pour le Sprint 3 : US-03 (Siri),
US-05 (deadlines), US-11 (push), US-13 (widget), US-20 (partage), US-22 (Gemini MCP).
Décisions de cadrage prises avant ce design (session du 2026-07-22) :

- **US-20 en premier** (priorité audit : viralité, terrain déjà prêt via `PerfectOverlay` +
  `day_results`).
- **US-13 (widget) retiré du périmètre concret** : un vrai widget d'écran d'accueil
  (HP en direct) exige WidgetKit (iOS) / App Widgets (Android), donc une app native —
  hors de portée d'un projet 100% web Next.js/Vercel. Documenté comme bloqué, à reprendre
  si une app native voit le jour un jour.
- **US-03 (Siri) reste faisable sans app native** : le spec original parle de
  "raccourcis OS", ce qui correspond au pattern standard iOS Shortcuts + webhook
  (l'utilisateur crée lui-même un raccourci Siri qui appelle une URL authentifiée
  côté Dodojo). Pas de blocage — à spécifier dans son propre cycle plus tard.
- **PWA installable** retenue comme socle transverse (nécessaire pour US-11 : iOS
  n'autorise le Web Push que sur un site "ajouté à l'écran d'accueil" depuis 16.4+).
- Ordre retenu pour la suite (hors scope de ce document, un cycle spec→plan→impl par US) :
  US-20 → US-05 → PWA → US-11 → US-03 → US-22.

Ce document couvre uniquement **US-20**. Les autres US du Sprint 3 auront chacune leur
propre design doc en temps voulu.

---

## Périmètre US-20

En tant que Héros, je veux générer une carte visuelle de mon issue du jour et la
partager, pour crâner (ou assumer une défaite avec humilité, esprit dojo) auprès de
mes pairs — et, en creux, faire connaître Dodojo (boucle d'acquisition).

**Points d'entrée** (jour courant uniquement, pas de reshare depuis le Panthéon pour
cette itération) :
- `PerfectOverlay` (célébration K.O. en direct, avant clôture du jour)
- Carte de score du Rituel du Crépuscule (après clôture)

**Issues couvertes** : `victory`, `retreat`, `defeat` — toutes partageables, carte/ton
adaptés à l'issue (pas seulement la victoire : cohérent avec l'esprit dojo qui assume
la défaite plutôt que de la cacher).

---

## Contenu de la carte

Champs affichés : pseudo, héros équipé (sprite), boss du jour (nom + sprite), issue
(victory/retreat/defeat), dégâts infligés, XP gagné, streak courant, niveau, titre,
date, nombre de tâches accomplies.

**Watermark / boucle d'acquisition (amélioration retenue)** : logo/nom "Dodojo" +
URL (`dodojo.vercel.app`) intégrés discrètement dans le PNG (coin bas de la carte).
Le texte de partage (`navigator.share({ text })`) inclut également une mention +
lien, ex. `"Boss vaincu sur Dodojo — dodojo.vercel.app"`.

**Format** : portrait 9:16 (story-first — c'est le format qui se partage le mieux
aujourd'hui sur les réseaux mobiles). Dimensions cible : 1080×1920.

**Troncature défensive** : pseudo déjà capé à 24 caractères à la création (cohérent
avec `OnboardingFlow.tsx`, `maxLength={24}`) — le template applique en plus un
`text-overflow: ellipsis` sur une seule ligne par sécurité. Les noms de boss viennent
d'un catalogue fixe (`lib/bosses.ts`, non modifiable par l'utilisateur) donc pas de
risque d'injection de longueur, mais même traitement d'ellipsis appliqué par
cohérence de template.

**Variante palier de série (amélioration retenue)** : si le jour partagé franchit un
palier de streak (7/30/100, `titleForStreak`), la carte bascule en variante
"flourish" — VFX flammes réutilisées de la super-variante Perfect/K.O. (US-16),
mention du titre de palier mise en avant. Sert directement l'objectif de viralité :
un jour spécial donne une raison concrète de plus de partager.

---

## Génération de l'image

Route serveur Next.js utilisant `@vercel/og` (Satori) : reçoit les données de carte
en **paramètres explicites** (pas de lookup `day_result` par id) et rend un template
JSX flexbox → PNG.

**Pourquoi pas de lookup DB** : `PerfectOverlay` se déclenche *avant* la clôture du
jour (`closeDay`) — aucun `day_result` n'existe encore à ce moment (le Boss peut même
renaître si une tâche est rajoutée après le K.O., cf. note projet sur `koOutcome`).
Passer les valeurs en paramètres explicites permet à la route de fonctionner
identiquement pour les deux points d'entrée :
- `PerfectOverlay` envoie un **snapshot live** de l'état de combat en cours (dégâts
  du jour, XP du jour, streak preview, niveau, titre, nb tâches, boss id, issue
  déduite de `koOutcome`).
- Le récap Crépuscule envoie les valeurs du `day_result` qui vient d'être calculé
  par `closeDay`.

**Contrepartie assumée** : la route ne vérifie pas que les valeurs reçues
correspondent à un combat réel — n'importe qui pourrait forger une carte fictive en
bidouillant les paramètres. Pas un risque de sécurité réel (aucune donnée privée
exposée, juste une image générée), cohérent avec la plupart des générateurs de
cartes partageables publics. Authentification requise malgré tout côté route (session
Supabase), en garde-fou anti-abus basique plutôt qu'en contrôle d'intégrité des
données.

**Cache Edge (amélioration retenue)** : les paramètres déterminent entièrement le
PNG produit (mêmes params → même image). La route répond avec
`Cache-Control: public, immutable, max-age=31536000` — un partage répété du même
jour ne re-déclenche pas de rendu Satori. Réduit le coût de calcul.

---

## Partage côté client

1. Bouton "Partager" (sur `PerfectOverlay` et la carte Crépuscule) → état chargement.
2. Fetch de la route de génération (même origine, session requise) → `Blob` PNG.
3. Si `navigator.canShare`/`navigator.share` disponible (fichiers) → partage natif OS
   avec `{ files: [file], text: "... sur Dodojo — dodojo.vercel.app" }`.
4. Sinon (desktop Safari ancien, Firefox) → **copie dans le presse-papier**
   (`navigator.clipboard.write([new ClipboardItem({...})])`, amélioration retenue)
   si disponible — plus pratique pour coller directement dans une conversation
   qu'un fichier téléchargé à rattacher manuellement. Si le Clipboard API est aussi
   indisponible, fallback final en téléchargement direct du PNG.

**Analytics minimal (amélioration retenue)** : un compteur d'usage (ex. colonne ou
table légère, à trancher en plan) enregistrant `share_clicked` et
`share_succeeded`/`share_downloaded` — objectif : mesurer si la feature est
réellement utilisée (raison même de sa priorisation dans l'audit).

---

## États & erreurs

- Échec de génération (police/sprite manquant, timeout Satori) → toast d'erreur,
  n'affecte pas l'overlay/la carte existants (feature additive, jamais bloquante).
- `navigator.share` rejeté/annulé par l'utilisateur (comportement natif standard,
  ex. l'utilisateur ferme la feuille de partage) → pas de toast d'erreur, juste
  retour à l'état normal du bouton.

---

## Tests

- **Vitest** : fonction pure de mapping (état combat live *ou* `day_result`) →
  paramètres de carte (dégâts, xp, streak, titre, issue, troncature). Testée
  indépendamment pour les deux sources (live vs persisté).
- Pas de test e2e Playwright sur `navigator.share` (API peu fiable en headless) :
  vérifier seulement que le bouton déclenche l'appel réseau vers la route de
  génération et affiche le fallback téléchargement quand `navigator.share` est
  mocké absent.
