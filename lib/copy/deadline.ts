import type { AggressivityLevel } from "../../types";

interface DeadlineAlertArgs {
  taskTitle: string;
  damage: number;
}

export function deadlineAlertLine(level: AggressivityLevel, args: DeadlineAlertArgs): string {
  const { taskTitle, damage } = args;
  const lines: Record<AggressivityLevel, string> = {
    sensei: `⏰ Le temps a filé : « ${taskTitle} » a dépassé son heure (−${damage} HP).`,
    sparring: `⏰ Attaque Surprise : « ${taskTitle} » a raté sa deadline (−${damage} HP).`,
    street: `⏰ Attaque Surprise, merde : « ${taskTitle} » a foiré sa deadline (−${damage} HP).`,
  };
  return lines[level];
}
