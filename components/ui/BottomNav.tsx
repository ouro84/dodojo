import Link from "next/link";

type NavKey = "arene" | "qg" | "echoppe";

interface BottomNavProps {
  active: NavKey;
}

const ITEMS: Array<{ key: NavKey; label: string; href: string }> = [
  { key: "arene", label: "Arène", href: "/" },
  { key: "qg", label: "Vestiaire", href: "/vestiaire" },
  { key: "echoppe", label: "Marché Noir", href: "/marche-noir" },
];

export default function BottomNav({ active }: BottomNavProps) {
  return (
    <nav
      aria-label="Navigation principale"
      className="sticky bottom-0 z-30 mt-auto flex justify-around border-t border-border bg-bg pt-2.5 lg:fixed lg:inset-y-0 lg:left-0 lg:mt-0 lg:w-20 lg:flex-col lg:items-center lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:pt-6"
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 px-4 py-2.5 text-[0.65rem] uppercase tracking-wide ${
              isActive ? "font-semibold text-ink" : "text-faint"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? "bg-hp" : "bg-faint"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
