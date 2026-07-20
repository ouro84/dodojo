"use client";

import { useState, type FormEvent } from "react";

interface SubtaskFormProps {
  onAdd: (title: string) => void;
  pending?: boolean;
}

export default function SubtaskForm({ onAdd, pending = false }: SubtaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Diviser en sous-quête"
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-faint hover:text-ink focus-visible:text-ink"
      >
        +
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="ml-6 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5"
    >
      <label htmlFor="new-subtask" className="sr-only">
        Ajouter une sous-tâche
      </label>
      <input
        id="new-subtask"
        name="title"
        type="text"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Sous-quête…"
        maxLength={140}
        className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-faint"
      />
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-md bg-hp px-2 py-1 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-40"
      >
        Ajouter
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Annuler"
        className="shrink-0 text-xs text-faint hover:text-alert"
      >
        ×
      </button>
    </form>
  );
}
