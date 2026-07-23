"use client";

import { useEffect } from "react";
import { initInstallPromptCapture } from "@/lib/pwa/install-prompt-client";

// Aucune UI : assure que l'écoute de `beforeinstallprompt` démarre dès le
// premier rendu client, quelle que soit la page d'entrée (montée depuis le
// layout racine, chargé sur toutes les routes) — l'évènement ne se rejoue
// pas s'il est manqué.
export default function InstallPromptCapture() {
  useEffect(() => {
    initInstallPromptCapture();
  }, []);
  return null;
}
