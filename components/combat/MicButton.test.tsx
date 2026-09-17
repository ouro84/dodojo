// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MicButton from "./MicButton";

afterEach(() => {
  cleanup();
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
});

// Reproduit un moteur (Android Chrome notamment) qui ignore
// `interimResults = false` et livre plusieurs `onresult` avant le résultat
// final — chacun avec un transcript de plus en plus long, seul le dernier
// portant `isFinal: true`.
function installFakeRecognition() {
  const instances: FakeSpeechRecognition[] = [];

  class FakeSpeechRecognition extends EventTarget {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;

    constructor() {
      super();
      instances.push(this);
    }

    start() {}
    stop() {}
    abort() {}

    emit(transcript: string, isFinal: boolean) {
      // Forme réelle du DOM : SpeechRecognitionResult est un array-like
      // (alternatives indexées) portant lui-même `isFinal`, pas l'alternative.
      const result = Object.assign([{ transcript }], { isFinal });
      this.onresult?.({ results: [result] });
    }
  }

  (window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeSpeechRecognition;
  return instances;
}

describe("MicButton — résultats interim d'un moteur qui ignore interimResults=false", () => {
  it("n'appelle onTranscript qu'une fois, avec le transcript final", () => {
    const instances = installFakeRecognition();
    const onTranscript = vi.fn();
    render(<MicButton onTranscript={onTranscript} />);

    fireEvent.click(screen.getByLabelText("Dicter une tâche"));
    const recognition = instances[0];

    recognition.emit("c", false);
    recognition.emit("co", false);
    recognition.emit("cou", false);
    recognition.emit("couc", false);
    recognition.emit("couco", false);
    recognition.emit("coucou", true);

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith("coucou");
  });
});
