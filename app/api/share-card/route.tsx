import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { parseShareCardParams, type ShareCardParams } from "@/lib/share-card";
import { getHero, DEFAULT_HERO_ID } from "@/lib/heroes";
import { getBoss, DEFAULT_BOSS_ID } from "@/lib/bosses";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

const OUTCOME_LABEL: Record<ShareCardParams["outcome"], string> = {
  victory: "Victoire",
  retreat: "Retraite",
  defeat: "Défaite",
};

const OUTCOME_COLOR: Record<ShareCardParams["outcome"], string> = {
  victory: "#f2c94c",
  retreat: "#e8e6e1",
  defeat: "#e0603f",
};

async function toDataUri(publicRelativePath: string): Promise<string> {
  const bytes = await readFile(join(process.cwd(), "public", publicRelativePath));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

// US-20 : aucun lookup `day_result` ici — PerfectOverlay se déclenche *avant*
// la clôture du jour (aucune ligne day_results n'existe encore à cet instant),
// donc toutes les valeurs de la carte arrivent en paramètres explicites (cf.
// docs/superpowers/specs/2026-07-22-us20-partage-victoire-design.md).
// Contrepartie assumée : la route ne vérifie pas que les valeurs reçues
// correspondent à un combat réel (paramètres forgeables) — l'authentification
// ci-dessous est un garde-fou anti-abus basique, pas un contrôle d'intégrité.
// Runtime Node.js (par défaut, pas "edge") : requis pour lire les sprites/la
// police locaux via node:fs — le cache HTTP (Cache-Control ci-dessous) est
// indépendant du runtime et est bien honoré par le CDN Vercel.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Non authentifié.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const params = parseShareCardParams(searchParams);
  if (!params) {
    return new Response("Paramètres de carte invalides.", { status: 400 });
  }

  const hero = getHero(params.heroId) ?? getHero(DEFAULT_HERO_ID)!;
  const boss = getBoss(params.bossId) ?? getBoss(DEFAULT_BOSS_ID)!;

  try {
    const [heroFrameSrc, bossFrameSrc, boldPixels] = await Promise.all([
      toDataUri(`${hero.spriteBase.replace(/^\//, "")}/still.png`),
      toDataUri(`${boss.spriteBase.replace(/^\//, "")}/still.png`),
      readFile(join(process.cwd(), "public/fonts/boldpixels.woff")),
    ]);

    const outcomeLabel = OUTCOME_LABEL[params.outcome];
    const outcomeColor = OUTCOME_COLOR[params.outcome];
    const isFlourish = params.milestone !== null;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "64px 56px",
            background: isFlourish
              ? "linear-gradient(180deg, #3a1d0a 0%, #1b0f22 55%, #0d0912 100%)"
              : "linear-gradient(180deg, #241226 0%, #150c1e 55%, #0d0912 100%)",
            color: "#f4f1ec",
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "BoldPixels",
                fontSize: 40,
                color: "#f2c94c",
                letterSpacing: 2,
              }}
            >
              DODOJO
            </span>
            <span style={{ fontSize: 24, color: "#a79f95" }}>{params.dayDate}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexGrow: 1,
              gap: 28,
            }}
          >
            <span
              style={{
                fontSize: 84,
                fontWeight: 700,
                color: outcomeColor,
                textTransform: "uppercase",
                letterSpacing: 4,
              }}
            >
              {outcomeLabel}
            </span>

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 40,
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Satori exige un <img> natif */}
                <img
                  src={heroFrameSrc}
                  alt={hero.name}
                  width={160}
                  height={160}
                  style={{ imageRendering: "pixelated" }}
                />
                <span style={{ fontSize: 22, color: "#e8e6e1" }}>{hero.name}</span>
              </div>
              <span style={{ fontFamily: "BoldPixels", fontSize: 32, color: "#f2c94c" }}>VS</span>
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Satori exige un <img> natif */}
                <img
                  src={bossFrameSrc}
                  alt={boss.name}
                  width={160}
                  height={160}
                  style={{
                    imageRendering: "pixelated",
                    transform: boss.flip ? "scaleX(-1)" : "scaleX(1)",
                  }}
                />
                <span style={{ fontSize: 22, color: "#e8e6e1" }}>{boss.name}</span>
              </div>
            </div>

            <span style={{ fontSize: 30, color: "#f4f1ec" }}>
              {params.username} · Niveau {params.level}
              {params.title ? ` · ${params.title}` : ""}
            </span>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                maxWidth: 720,
                gap: 16,
                borderRadius: 12,
                border: "2px solid #4a3f52",
                padding: "28px 32px",
                background: "rgba(20, 12, 24, 0.6)",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 24, color: "#a79f95" }}>Dégâts infligés</span>
                <span style={{ fontFamily: "BoldPixels", fontSize: 24, color: "#e0603f" }}>
                  {params.damageDealt} HP
                </span>
              </div>
              <div
                style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 24, color: "#a79f95" }}>Monstres vaincus</span>
                <span style={{ fontSize: 24, color: "#e8e6e1" }}>{params.tasksCompleted}</span>
              </div>
              <div
                style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 24, color: "#a79f95" }}>XP gagnée</span>
                <span style={{ fontFamily: "BoldPixels", fontSize: 24, color: "#8f7fd6" }}>
                  +{params.xpEarned}
                </span>
              </div>
              {params.streak > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 24, color: "#a79f95" }}>Série en cours</span>
                  <span style={{ fontSize: 24, color: "#f2c94c" }}>{params.streak} jours</span>
                </div>
              )}
            </div>

            {isFlourish && (
              <span
                style={{
                  fontFamily: "BoldPixels",
                  fontSize: 28,
                  color: "#f2c94c",
                  textAlign: "center",
                }}
              >
                🔥 Palier de série : {params.milestone} jours 🔥
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "2px solid #4a3f52",
              paddingTop: 24,
            }}
          >
            <span style={{ fontFamily: "BoldPixels", fontSize: 22, color: "#f2c94c" }}>
              DODOJO
            </span>
            <span style={{ fontSize: 20, color: "#a79f95" }}>dodojo.vercel.app</span>
          </div>
        </div>
      ),
      {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        fonts: [{ name: "BoldPixels", data: boldPixels, weight: 400, style: "normal" }],
        headers: {
          "Cache-Control": "public, immutable, max-age=31536000",
        },
      },
    );
  } catch {
    return new Response("Génération de la carte impossible.", { status: 500 });
  }
}
