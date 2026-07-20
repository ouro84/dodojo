const MAX_LENGTH = 140;

export function sanitizeTranscript(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  return collapsed.slice(0, MAX_LENGTH);
}
