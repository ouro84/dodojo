import type { ReactNode } from "react";

interface IntegrationsSectionProps {
  children: ReactNode;
}

// US-11 : première section du QG à accueillir des blocs d'intégration
// externe. US-03 (Siri/webhook) et US-22 (Gemini MCP) ajouteront chacun leur
// propre bloc en enfant ici, dans l'ordre du sprint — jamais une nouvelle
// section concurrente.
export default function IntegrationsSection({ children }: IntegrationsSectionProps) {
  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-hud text-xs font-semibold uppercase tracking-wide text-muted">Intégrations</p>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
