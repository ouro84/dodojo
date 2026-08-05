import { inngest } from "@/lib/inngest/client";

interface ScheduleDeadlineReminderParams {
  taskId: string;
  userId: string;
  deadlineAt: string;
  offsetMinutes: number;
}

// Issue #114 : émission best-effort — un échec ne doit jamais faire échouer
// l'action utilisateur qui l'a déclenché (même philosophie que l'envoi push
// existant, qui catch ses propres erreurs réseau).
export async function scheduleDeadlineReminder(params: ScheduleDeadlineReminderParams): Promise<void> {
  try {
    await inngest.send({ name: "task/deadline-reminder-set", data: params });
  } catch {
    // best-effort
  }
}

export async function cancelDeadlineReminder(taskId: string): Promise<void> {
  try {
    await inngest.send({ name: "task/deadline-reminder-cleared", data: { taskId } });
  } catch {
    // best-effort
  }
}
