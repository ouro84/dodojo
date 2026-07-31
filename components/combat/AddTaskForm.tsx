"use client";

import { useState, type FormEvent } from "react";
import MicButton from "./MicButton";

interface AddTaskFormProps {
  onAdd: (title: string) => void;
  pending?: boolean;
  // Issue #116 : AddTaskForm est réutilisé par TomorrowSection sur le même
  // écran que le formulaire du jour — id/libellé distincts obligatoires
  // (sinon id HTML dupliqué + deux labels "Ajouter une tâche" ambigus).
  inputId?: string;
  label?: string;
}

export default function AddTaskForm({
  onAdd,
  pending = false,
  inputId = "new-task",
  label = "Ajouter une tâche",
}: AddTaskFormProps) {
  const [title, setTitle] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        name="title"
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Balance ta tâche…"
        maxLength={140}
        className="flex-1 rounded bg-transparent text-sm text-ink outline-none placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-xp focus-visible:outline-offset-2"
      />
      <MicButton disabled={pending} onTranscript={onAdd} />
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-md bg-hp px-3 py-2.5 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-40"
      >
        Ajouter
      </button>
    </form>
  );
}
