"use client";

import { useState, type FormEvent } from "react";

interface AddTaskFormProps {
  onAdd: (title: string) => void;
  pending?: boolean;
}

export default function AddTaskForm({ onAdd, pending = false }: AddTaskFormProps) {
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
      <label htmlFor="new-task" className="sr-only">
        Ajouter une tâche
      </label>
      <input
        id="new-task"
        name="title"
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Balance ta tâche…"
        maxLength={140}
        className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
      />
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-40"
      >
        Ajouter
      </button>
    </form>
  );
}
