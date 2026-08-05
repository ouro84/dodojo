// Issue #114 : events du moteur de rappel avant deadline. offsetMinutes
// voyage dans l'event (jamais recalculé côté fonction Inngest, cohérent avec
// le déterminisme requis par les retries — cf. SendReminderEvent).
export interface ScheduleDeadlineReminderEvent {
  name: "task/deadline-reminder-set";
  data: {
    taskId: string;
    userId: string;
    deadlineAt: string; // ISO UTC, valeur de tasks.deadline_at à l'émission
    offsetMinutes: number; // résolu (task.reminder_offset_minutes ?? profile.reminder_offset_minutes)
  };
}

export interface CancelDeadlineReminderEvent {
  name: "task/deadline-reminder-cleared";
  data: { taskId: string };
}
