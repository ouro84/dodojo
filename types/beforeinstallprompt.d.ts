export {};

declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    prompt(): Promise<void>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }

  interface Navigator {
    standalone?: boolean;
  }
}
