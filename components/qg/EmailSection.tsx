"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Issue #69 : changement d'email, même contrainte client-side que
// PasswordSection. ⚠️ supabase/config.toml a double_confirm_changes=true :
// Supabase exige une confirmation depuis l'ancienne ET la nouvelle adresse
// avant que le changement soit effectif — le message de succès reflète ça,
// pas un changement immédiat. À vérifier manuellement en prod avant merge
// (le config.toml local ne garantit pas la config du projet hébergé).
export default function EmailSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
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

    const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
    setPending(false);
    if (updateError) {
      setError("Dodojo n'a pas pu changer ton email. Réessaie.");
      return;
    }
    setCurrentPassword("");
    setNewEmail("");
    setSuccess(true);
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Email</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="profil-email-password" className="text-xs text-muted">
          Mot de passe actuel
        </label>
        <input
          id="profil-email-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        <label htmlFor="profil-new-email" className="text-xs text-muted">
          Nouvel email
        </label>
        <input
          id="profil-new-email"
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        {error && (
          <p role="alert" className="text-xs text-alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-hp-text">
            Vérifie ta boîte mail actuelle et ta nouvelle adresse : clique sur les deux liens de
            confirmation pour valider le changement.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-hp px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {pending ? "…" : "Changer l'email"}
        </button>
      </form>
    </section>
  );
}
