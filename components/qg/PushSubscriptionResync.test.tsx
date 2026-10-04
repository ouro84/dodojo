// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resyncPushSubscription } from "./PushSubscriptionResync";

const { getServiceWorkerRegistrationMock } = vi.hoisted(() => ({
  getServiceWorkerRegistrationMock: vi.fn(),
}));
vi.mock("@/lib/pwa/update-prompt-client", () => ({
  getServiceWorkerRegistration: getServiceWorkerRegistrationMock,
}));

const { subscribeToPushMock, getPushSubscriptionStateMock } = vi.hoisted(() => ({
  subscribeToPushMock: vi.fn(),
  getPushSubscriptionStateMock: vi.fn(),
}));
vi.mock("@/app/actions/push", () => ({
  subscribeToPush: subscribeToPushMock,
  getPushSubscriptionState: getPushSubscriptionStateMock,
}));

function makeFakeSubscription(endpoint: string) {
  return {
    endpoint,
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
  };
}

function makeFakeRegistration(existing: ReturnType<typeof makeFakeSubscription> | null) {
  return {
    pushManager: {
      getSubscription: vi.fn(async () => existing),
      subscribe: vi.fn(async () => makeFakeSubscription("https://push.example/fresh")),
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public-key");
  getServiceWorkerRegistrationMock.mockReset();
  subscribeToPushMock.mockReset().mockResolvedValue({ error: null });
  getPushSubscriptionStateMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resyncPushSubscription (issue #215)", () => {
  test("souscription locale expirée en base : remplacée par une neuve", async () => {
    const stale = makeFakeSubscription("https://push.example/stale");
    const registration = makeFakeRegistration(stale);
    getServiceWorkerRegistrationMock.mockResolvedValue(registration);
    getPushSubscriptionStateMock.mockResolvedValue("expired");

    await expect(resyncPushSubscription()).resolves.toBe("resubscribed");

    expect(getPushSubscriptionStateMock).toHaveBeenCalledWith("https://push.example/stale");
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(subscribeToPushMock).toHaveBeenCalledWith({
      endpoint: "https://push.example/fresh",
      keys: { p256dh: "p", auth: "a" },
    });
  });

  test("souscription active : rien n'est touché", async () => {
    const local = makeFakeSubscription("https://push.example/ok");
    const registration = makeFakeRegistration(local);
    getServiceWorkerRegistrationMock.mockResolvedValue(registration);
    getPushSubscriptionStateMock.mockResolvedValue("active");

    await expect(resyncPushSubscription()).resolves.toBe("up-to-date");

    expect(local.unsubscribe).not.toHaveBeenCalled();
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(subscribeToPushMock).not.toHaveBeenCalled();
  });

  // Garde-fou d'opt-in : un endpoint que la base ne connaît pas pour ce compte
  // (jamais abonné, désactivé, ou appartenant à un autre compte de l'appareil)
  // ne doit jamais abonner cet utilisateur d'office.
  test("endpoint inconnu pour ce compte : jamais d'abonnement d'office", async () => {
    const local = makeFakeSubscription("https://push.example/other-account");
    const registration = makeFakeRegistration(local);
    getServiceWorkerRegistrationMock.mockResolvedValue(registration);
    getPushSubscriptionStateMock.mockResolvedValue("unknown");

    await expect(resyncPushSubscription()).resolves.toBe("skipped");

    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(subscribeToPushMock).not.toHaveBeenCalled();
  });

  test("aucune souscription locale : aucun appel serveur", async () => {
    getServiceWorkerRegistrationMock.mockResolvedValue(makeFakeRegistration(null));

    await expect(resyncPushSubscription()).resolves.toBe("skipped");

    expect(getPushSubscriptionStateMock).not.toHaveBeenCalled();
  });

  test("permission non accordée : rien n'est tenté", async () => {
    vi.stubGlobal("Notification", { permission: "default" });

    await expect(resyncPushSubscription()).resolves.toBe("skipped");

    expect(getServiceWorkerRegistrationMock).not.toHaveBeenCalled();
  });

  test("subscribe() refusé par le navigateur : échec silencieux, rien enregistré", async () => {
    const registration = makeFakeRegistration(makeFakeSubscription("https://push.example/stale"));
    registration.pushManager.subscribe.mockRejectedValue(new Error("NotAllowedError"));
    getServiceWorkerRegistrationMock.mockResolvedValue(registration);
    getPushSubscriptionStateMock.mockResolvedValue("expired");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(resyncPushSubscription()).resolves.toBe("failed");

    expect(subscribeToPushMock).not.toHaveBeenCalled();
  });
});
