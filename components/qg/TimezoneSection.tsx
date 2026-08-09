"use client";

import { useMemo, useState, useTransition } from "react";
import { updateTimezone } from "@/app/actions/profile";
import { useBrowserTimezone } from "@/hooks/useBrowserTimezone";

interface TimezoneSectionProps {
  initialTimezone: string;
}

// Issue #69 : fuseau horaire éditable, jusqu'ici fixé une seule fois à
// l'onboarding. Liste déroulante native (Intl.supportedValuesOf, aucune
// liste à maintenir) + bouton Redétecter qui réutilise le hook existant.
export default function TimezoneSection({ initialTimezone }: TimezoneSectionProps) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const browserTimezone = useBrowserTimezone();

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return all.includes(timezone) ? all : [timezone, ...all];
  }, [timezone]);

  function save(next: string) {
    const previous = timezone;
    setTimezone(next);
    setError(null);
    startTransition(async () => {
      const result = await updateTimezone(next);
      if (result.error) {
        setTimezone(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="profil-timezone" className="text-xs text-muted">
        Fuseau horaire
      </label>
      <div className="flex items-center gap-2">
        <select
          id="profil-timezone"
          value={timezone}
          disabled={isPending}
          onChange={(event) => save(event.target.value)}
          className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || browserTimezone === timezone}
          onClick={() => save(browserTimezone)}
          className="rounded border border-border px-2 py-1 text-xs text-muted disabled:opacity-40"
        >
          Redétecter
        </button>
      </div>
      <p className="text-xs text-faint">
        Change le calcul du jour en cours si tu voyages ou changes de fuseau.
      </p>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
