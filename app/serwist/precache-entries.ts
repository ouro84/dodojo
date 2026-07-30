// Piège découvert en diagnostiquant #102 (bug préexistant depuis b2506a1,
// jamais lié à la migration push/Inngest) : /fonts/boldpixels.woff2 et .woff
// étaient référencées ici ET via @font-face (app/globals.css), donc déjà
// auto-précachées avec une révision en hash de contenu par le pipeline de
// build. Les lister aussi ici, avec une révision différente (SHA de build),
// crée DEUX entrées conflictuelles pour la même URL — Workbox lève
// "add-to-cache-list-conflicting-entries" à l'évaluation du script, ce qui
// empêche l'installation du service worker pour TOUT LE MONDE, en silence
// (aucune erreur visible ailleurs que côté navigateur/CDP `ServiceWorker`).
// Ne jamais y remettre un asset public déjà référencé dans le CSS/JS du
// build — /offline (route Next dynamique) et /manifest.webmanifest
// (app/manifest.ts, pas un fichier statique) n'ont pas ce problème.
// Fichier séparé de route.ts (plutôt qu'inline) pour que route.test.ts
// puisse l'importer sans déclencher createSerwistRoute() au chargement.
export function buildAdditionalPrecacheEntries(revision: string | null) {
  return [
    { url: "/offline", revision },
    { url: "/manifest.webmanifest", revision },
  ];
}
