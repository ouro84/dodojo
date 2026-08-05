"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Issue #69 : changement de mot de passe, client-side pur (une server action
// ne propage pas le cookie de session, même contrainte que /login et
// /welcome). Reconfirmation par mot de passe actuel avant tout changement.
export default function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("Nouveau mot de passe : 8 caractères minimum.");
      return;
    }
    setPending(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("Session expirée. Reconnecte-toi.");
      setPending(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      setError("Mot de passe actuel incorrect.");
      setPending(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setPending(false);
    if (updateError) {
      setError("Dodojo n'a pas pu changer ton mot de passe. Réessaie.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setSuccess(true);
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Mot de passe</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="profil-current-password" className="text-xs text-muted">
          Mot de passe actuel
        </label>
        <input
          id="profil-current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        <label htmlFor="profil-new-password" className="text-xs text-muted">
          Nouveau mot de passe
        </label>
        <input
          id="profil-new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        {error && (
          <p role="alert" className="text-xs text-alert">
            {error}
          </p>
        )}
        {success && <p className="text-xs text-hp-text">Mot de passe mis à jour.</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-hp px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {pending ? "…" : "Changer le mot de passe"}
        </button>
      </form>
    </section>
  );
}
