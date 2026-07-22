import Link from "next/link";
import guide from "@/content/guide.json";
import type { Guide } from "@/lib/guide";
import GuideSections from "@/components/guide/GuideSections";

export const metadata = { title: "Manuel du Dojo" };

export default function GuidePage() {
  const data = guide as Guide;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Manuel du Dojo
      </h1>
      {data.sections.length === 0 ? (
        <p className="text-center text-sm text-muted">Manuel en préparation.</p>
      ) : (
        <GuideSections sections={data.sections} />
      )}
      <p className="text-center text-[10px] text-faint">Mis à jour le {data.updatedAt}</p>
      <Link href="/qg" className="self-center text-xs text-muted underline underline-offset-4">
        Retour au QG
      </Link>
    </main>
  );
}
