// Codes d'erreur du domaine. Le domaine ne connaît AUCUN message français :
// la traduction en copy « voix » appartient aux server actions (app/actions/),
// qui seules savent à qui elles parlent. Le serveur MCP, lui, renvoie ces
// codes tels quels à un agent (cf. D6.3 du spec).
export type DomainErrorCode =
  | "invalid_task_id"
  | "invalid_title"
  | "task_not_found"
  | "task_abandoned"
  | "depth_limit"
  | "fetch_failed"
  | "insert_failed"
  | "update_failed"
  | "profile_not_found"
  | "hero_not_found"
  | "hero_not_owned"
  | "skin_not_found"
  | "skin_not_owned";

export interface DomainResult {
  error: DomainErrorCode | null;
}
