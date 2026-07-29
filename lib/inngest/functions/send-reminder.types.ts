// Type de l'event Inngest envoyé (soit par schedule per-user en L2, soit
// manuellement depuis le dashboard dev server en L1) pour déclencher l'envoi
// d'un reminder push à un profil donné.
export interface SendReminderEvent {
  name: "send-reminder";
  data: {
    profileId: string;
  };
}
