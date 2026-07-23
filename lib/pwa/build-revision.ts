// Dérive un identifiant de build stable pour invalider le precache du
// service worker à chaque déploiement Vercel (main se déploie
// automatiquement à chaque merge, cf. CLAUDE.md). Priorité : SHA fourni par
// Vercel > `git rev-parse HEAD` en local > UUID aléatoire en dernier
// recours (jamais bloquant pour le build).
export function resolveBuildRevision(
  vercelCommitSha: string | undefined,
  resolveGitSha: () => string | null,
): string {
  if (vercelCommitSha) return vercelCommitSha;
  const fromGit = resolveGitSha();
  if (fromGit) return fromGit;
  return crypto.randomUUID();
}
