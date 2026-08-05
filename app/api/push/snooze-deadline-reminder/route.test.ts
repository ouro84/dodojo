import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

let dbTables: Record<string, Row[]> = {};

class FakeQueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(private readonly rows: Row[]) {}
  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const matched = this.rows.filter((row) => this.filters.every((f) => f(row)));
    return Promise.resolve({ data: matched[0] ?? null, error: null });
  }
}

class FakeSupabaseClient {
  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(dbTables[table] ?? []);
  }
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => new FakeSupabaseClient() }));

const { scheduleDeadlineReminderMock } = vi.hoisted(() => ({
  scheduleDeadlineReminderMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/inngest/deadline-reminder", () => ({
  scheduleDeadlineReminder: scheduleDeadlineReminderMock,
}));

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

function makeRequest(body: unknown): Request {
  return new Request("https://dodojo.test/api/push/snooze-deadline-reminder", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  stubEnv();
  scheduleDeadlineReminderMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T15:30:00.000Z"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("POST /api/push/snooze-deadline-reminder", () => {
  test("programme un nouveau rappel ~15 min plus tard si la deadline est assez loin", async () => {
    dbTables = {
      tasks: [
        {
          id: "t1",
          user_id: "u1",
          deadline_at: "2026-08-01T16:30:00.000Z",
          is_completed: false,
          is_abandoned: false,
          reminder_enabled: true,
        },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    const json = await response.json();
    expect(json).toEqual({ scheduled: true });
    expect(scheduleDeadlineReminderMock).toHaveBeenCalledWith({
      taskId: "t1",
      userId: "u1",
      deadlineAt: "2026-08-01T16:30:00.000Z",
      offsetMinutes: 45,
    });
  });

  test("ne programme rien si la tâche est introuvable", async () => {
    dbTables = { tasks: [] };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    expect(await response.json()).toEqual({ scheduled: false });
    expect(scheduleDeadlineReminderMock).not.toHaveBeenCalled();
  });

  test("ne programme rien si la tâche est complétée", async () => {
    dbTables = {
      tasks: [
        {
          id: "t1",
          user_id: "u1",
          deadline_at: "2026-08-01T16:30:00.000Z",
          is_completed: true,
          is_abandoned: false,
          reminder_enabled: true,
        },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    expect(await response.json()).toEqual({ scheduled: false });
  });

  test("ne programme rien si la deadline est trop proche (moins de 15 min)", async () => {
    dbTables = {
      tasks: [
        {
          id: "t1",
          user_id: "u1",
          deadline_at: "2026-08-01T15:40:00.000Z",
          is_completed: false,
          is_abandoned: false,
          reminder_enabled: true,
        },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    expect(await response.json()).toEqual({ scheduled: false, reason: "too-close" });
    expect(scheduleDeadlineReminderMock).not.toHaveBeenCalled();
  });
});
