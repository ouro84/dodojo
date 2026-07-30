// Type de l'event Inngest envoyé par le fan-out (lot L2b) pour déclencher
// l'envoi d'un reminder push à un profil donné. Toutes les valeurs
// non-déterministes (instant de sélection, jour local, variante de copy)
// sont figées ici par l'émetteur : `send-reminder` ne doit plus jamais
// calculer `new Date()` / `Math.random()` hors d'un `step.run` (cf. plan §6 L1b C1).
export interface SendReminderEvent {
  name: "push/send-reminder";
  data: {
    profileId: string;
    dayKey: string; // jour LOCAL du profil, calculé par le fan-out
    nowIso: string; // instant de sélection, fige la fenêtre horaire
    variantIndex: number; // fige la variante de copy (stabilité du seed)
  };
}
