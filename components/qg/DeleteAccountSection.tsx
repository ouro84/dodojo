"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "@/app/actions/account";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const CONFIRM_TEXT = "SUPPRIMER";

// Issue #154 (art. 17 RGPD) : suppression définitive du compte. Modale
// dismissable (onEscape fourni — contrairement à WakeUpRitual, cf. CLAUDE.md
// § useFocusTrap). Re-authentification par mot de passe (même pattern que
// PasswordSection.tsx) + texte de confirmation exact, double barrière avant
// une action irréversible.
export default function DeleteAccountSection() {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useFocusTrap(modalRef, { active: open, onEscape: () => setOpen(false) });

  function resetAndClose() {
    setOpen(false);
    setPassword("");
    setConfirmText("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
      password,
    });
    if (signInError) {
      setError("Mot de passe actuel incorrect.");
      setPending(false);
      return;
    }

    const result = await deleteAccount(confirmText);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    await supabase.auth.signOut();
    router.push("/welcome");
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-alert p-4">
      <p className="font-display text-xs uppercase tracking-wide text-alert">Zone dangereuse</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded border border-alert px-3 py-1.5 text-xs uppercase tracking-wide text-alert"
      >
        Supprimer mon compte
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
        >
          <div
            ref={modalRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-alert bg-surface p-4"
          >
            <h2 id="delete-account-title" className="font-display text-sm uppercase text-alert">
              Supprimer définitivement ton compte ?
            </h2>
            <p className="text-xs text-muted">
              Cette action est irréversible. Toutes tes données (tâches, historique de combat,
              héros débloqués) seront supprimées définitivement.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <label htmlFor="delete-account-password" className="text-xs text-muted">
                Mot de passe actuel
              </label>
              <input
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
              />
              <label htmlFor="delete-account-confirm" className="text-xs text-muted">
                Tape {CONFIRM_TEXT} pour confirmer
              </label>
              <input
                id="delete-account-confirm"
                type="text"
                required
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
              />
              {error && (
                <p role="alert" className="text-xs text-alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending || confirmText !== CONFIRM_TEXT}
                  className="rounded bg-alert px-3 py-1.5 text-xs uppercase tracking-wide text-alert-ink disabled:opacity-50"
                >
                  {pending ? "…" : "Supprimer définitivement"}
                </button>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-ink"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
