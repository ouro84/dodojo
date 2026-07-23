"use client";

import { useSyncExternalStore } from "react";
import {
  getUpdatePromptSnapshot,
  reloadForUpdate,
  subscribeUpdatePrompt,
} from "@/lib/pwa/update-prompt-client";

function getServerSnapshot(): boolean {
  return false;
}

export function usePwaUpdatePrompt(): {
  updateAvailable: boolean;
  reloadForUpdate: () => void;
} {
  const updateAvailable = useSyncExternalStore(
    subscribeUpdatePrompt,
    getUpdatePromptSnapshot,
    getServerSnapshot,
  );
  return { updateAvailable, reloadForUpdate };
}
