"use client";

import { useState, type FormEvent } from "react";
import MicButton from "./MicButton";

interface AddTaskFormProps {
  onAdd: (title: string) => void;
  pending?: boolean;
  // Issue #116 : AddTaskForm est réutilisé par TomorrowSection sur le même
  // écran que le formulaire du jour — id/libellé/texte de bouton distincts
  // obligatoires. Un id HTML dupliqué est invalide ; un libellé/texte de
  // bouton partagé casse silencieusement tout test e2e préexistant utilisant
  // un sélecteur non-exact ("Ajouter") dès que les deux formulaires sont
  // montés en même temps (régression réelle constatée sur 12+ specs e2e avant
  // ce correctif : `getByRole("button", { name: "Ajouter" })` matchait les
  // deux boutons identiques).
  inputId?: string;
  label?: string;
  submitLabel?: string;
  micLabel?: string;
}

export default function AddTaskForm({
  onAdd,
  pending = false,
  inputId = "new-task",
  label = "Ajouter une tâche",
  submitLabel = "Ajouter",
  micLabel = "Dicter une tâche",
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
        className="flex-1 rounded bg-transparent text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-xp"
      />
      <MicButton disabled={pending} onTranscript={onAdd} label={micLabel} />
      {/* Issue #195 : `pending` ne désactive plus la soumission. La soumission
          implicite d'un formulaire passe par un clic sur son bouton par défaut,
          et un bouton `disabled` l'annule purement et simplement : taper une
          tâche puis Entrée pendant qu'un ajout était encore en vol ne faisait
          RIEN (texte conservé dans le champ, aucun retour) — exactement ce que
          fait un utilisateur qui enchaîne trois tâches. Les ajouts concurrents
          sont désormais sérialisés côté Arène (`addQueueRef`), donc les
          accepter ne crée plus de collision de positions. */}
      <button
        type="submit"
        aria-busy={pending}
        disabled={!title.trim()}
        className="rounded-md bg-hp px-3 py-2.5 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </form>
  );
}
