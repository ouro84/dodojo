"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type SpeechToTextStatus = "idle" | "unsupported" | "listening" | "error";

interface UseSpeechToTextOptions {
  lang?: string;
  onResult: (transcript: string) => void;
}

interface UseSpeechToTextResult {
  status: SpeechToTextStatus;
  isSupported: boolean;
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Support du navigateur : constant après montage, ne change jamais en cours de vie
// du composant — pas besoin de s'abonner à un vrai événement.
function subscribeToSupport(): () => void {
  return () => {};
}

function getSupportSnapshot(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

function getServerSupportSnapshot(): boolean {
  return false;
}

function messageForError(error: SpeechRecognitionErrorCode): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Micro refusé. Autorise-le dans les réglages du navigateur.";
    case "no-speech":
      return "Rien entendu. Réessaie.";
    case "network":
      return "Connexion coupée. Réessaie.";
    default:
      return "Le micro a résisté. Réessaie.";
  }
}

export function useSpeechToText({
  lang = "fr-FR",
  onResult,
}: UseSpeechToTextOptions): UseSpeechToTextResult {
  const [status, setStatus] = useState<SpeechToTextStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSupported = useSyncExternalStore(
    subscribeToSupport,
    getSupportSnapshot,
    getServerSupportSnapshot,
  );
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setStatus("unsupported");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };

    recognition.onerror = (event) => {
      setStatus("error");
      setErrorMessage(messageForError(event.error));
    };

    recognition.onend = () => {
      setStatus((current) => (current === "listening" ? "idle" : current));
    };

    recognitionRef.current = recognition;
    setErrorMessage(null);
    setStatus("listening");
    recognition.start();
  }, [lang, onResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { status, isSupported, errorMessage, start, stop };
}
