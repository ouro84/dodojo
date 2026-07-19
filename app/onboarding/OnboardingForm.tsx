"use client";

import { useActionState } from "react";
import { createProfile, type CreateProfileState } from "./actions";

const initialState: CreateProfileState = { error: null };

export default function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createProfile,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="username"
          className="text-xs uppercase tracking-wide text-faint"
        >
          Ton pseudo de combattant
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          minLength={2}
          maxLength={24}
          autoComplete="off"
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-xp"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-hp px-4 py-2 font-display uppercase tracking-wide text-ink disabled:opacity-50"
      >
        {pending ? "…" : "Entrer dans l'Arène"}
      </button>
      <p className="text-xs text-faint">Ton nom. Ta rue.</p>
    </form>
  );
}
