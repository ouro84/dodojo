// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PushReminderToggle from "./PushReminderToggle";

afterEach(cleanup);

const { getServiceWorkerRegistrationMock } = vi.hoisted(() => ({
  getServiceWorkerRegistrationMock: vi.fn(),
}));
vi.mock("@/lib/pwa/update-prompt-client", () => ({
  getServiceWorkerRegistration: getServiceWorkerRegistrationMock,
}));

vi.mock("@/lib/pwa/push-subscribe", () => ({
  urlBase64ToUint8Array: vi.fn(() => new Uint8Array()),
}));

const { subscribeToPushMock, unsubscribeFromPushMock } = vi.hoisted(() => ({
  subscribeToPushMock: vi.fn(),
  unsubscribeFromPushMock: vi.fn(),
}));
vi.mock("@/app/actions/push", () => ({
  subscribeToPush: subscribeToPushMock,
  unsubscribeFromPush: unsubscribeFromPushMock,
}));

interface FakePushSubscription {
  endpoint: string;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
}

function makeFakeSubscription(): FakePushSubscription {
  return {
    endpoint: "https://push.example/existing",
    toJSON: () => ({
      endpoint: "https://push.example/existing",
      keys: { p256dh: "p", auth: "a" },
    }),
  };
}

function makeFakeRegistration(existing: FakePushSubscription | null) {
  return {
    pushManager: {
      getSubscription: vi.fn(async () => existing),
      subscribe: vi.fn(),
    },
  };
}

function stubNotification(permission: NotificationPermission): void {
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn(async () => permission),
  });
}

beforeEach(() => {
  getServiceWorkerRegistrationMock.mockReset();
  subscribeToPushMock.mockReset().mockResolvedValue({ error: null });
  unsubscribeFromPushMock.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PushReminderToggle", () => {
  test("T3.1 — souscription navigateur existante : pushManager.subscribe non appelé, aucune erreur, statut on", async () => {
    stubNotification("granted");
    const registration = makeFakeRegistration(makeFakeSubscription());
    getServiceWorkerRegistrationMock.mockResolvedValue(registration);

    render(<PushReminderToggle hasSubscription={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Activer" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Désactiver" })).toBeInTheDocument());
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(screen.queryByText(/Rappels indisponibles|Configuration push manquante/)).not.toBeInTheDocument();
  });

  test("T3.2 — souscription navigateur existante + hasSubscription=false : subscribeToPush appelé (réconciliation, piège H5)", async () => {
    stubNotification("granted");
    const registration = makeFakeRegistration(makeFakeSubscription());
    getServiceWorkerRegistrationMock.mockResolvedValue(registration);

    render(<PushReminderToggle hasSubscription={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Activer" }));

    await waitFor(() => expect(subscribeToPushMock).toHaveBeenCalledWith({
      endpoint: "https://push.example/existing",
      keys: { p256dh: "p", auth: "a" },
    }));
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Désactiver" })).toBeInTheDocument());
  });

  test("T3.3 — Notification.permission denied : bouton disabled + texte d'aide", () => {
    stubNotification("denied");

    render(<PushReminderToggle hasSubscription={false} />);

    const button = screen.getByRole("button", { name: "Bloqué par le navigateur" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Autorise les notifications/)).toBeInTheDocument();
  });

  test("T3.4 — service worker indisponible (cause réelle #102 : conflit de précache) : message d'erreur exact, statut reste off", async () => {
    stubNotification("granted");
    getServiceWorkerRegistrationMock.mockResolvedValue(null);

    render(<PushReminderToggle hasSubscription={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Activer" }));

    await waitFor(() =>
      expect(
        screen.getByText("Rappels indisponibles (app non installée ou service worker inactif)."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Activer" })).toBeInTheDocument();
    expect(subscribeToPushMock).not.toHaveBeenCalled();
  });
});
