import { get } from "@vercel/edge-config";
import { NextResponse } from "next/server";

const EC_KEY = "wc2026_scores";

// Extract Edge Config ID from the EDGE_CONFIG connection string
// Format: https://edge-config.vercel.com/ecfg_xxxx?token=...
function getEdgeConfigId(): string {
  const raw = process.env.EDGE_CONFIG ?? "";
  const match = raw.match(/edge-config\.vercel\.com\/(ecfg_[^?]+)/);
  return match?.[1] ?? "";
}

export async function GET() {
  try {
    const scores = await get<Record<string, { home: string; away: string }>>(EC_KEY);
    return NextResponse.json(scores ?? {});
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  try {
    const { matchNumber, side, value } = (await req.json()) as {
      matchNumber: number;
      side: "home" | "away";
      value: string;
    };

    // Read current scores
    const current: Record<string, { home: string; away: string }> =
      (await get<Record<string, { home: string; away: string }>>(EC_KEY)) ?? {};

    if (!current[matchNumber]) current[matchNumber] = { home: "", away: "" };
    current[matchNumber][side] = String(value).replace(/[^0-9]/g, "").slice(0, 2);

    // Write back via Vercel REST API
    const ecId = getEdgeConfigId();
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${ecId}/items`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.WC_VERCEL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ operation: "upsert", key: EC_KEY, value: current }],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Edge Config write failed:", err);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/scores error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
