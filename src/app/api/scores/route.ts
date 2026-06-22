import { get } from "@vercel/edge-config";
import { NextResponse } from "next/server";

const EC_KEY = "wc2026_scores";

// Hardcoded final scores for completed matches.
// Edge Config values always override these if present (manual corrections).
const HARDCODED_SCORES: Record<string, { home: string; away: string }> = {
  // ── Matchday 1 ──────────────────────────────────────────────────────────
  "1":  { home: "2", away: "0" }, // MEX 2-0 RSA
  "2":  { home: "2", away: "1" }, // KOR 2-1 CZE
  "3":  { home: "1", away: "1" }, // CAN 1-1 BIH
  "4":  { home: "4", away: "1" }, // USA 4-1 PAR
  "5":  { home: "1", away: "1" }, // QAT 1-1 SUI
  "6":  { home: "1", away: "1" }, // BRA 1-1 MAR
  "7":  { home: "0", away: "1" }, // HAI 0-1 SCO
  "8":  { home: "2", away: "0" }, // AUS 2-0 TUR
  "9":  { home: "7", away: "1" }, // GER 7-1 CUR
  "10": { home: "2", away: "2" }, // NED 2-2 JPN
  "11": { home: "1", away: "0" }, // CIV 1-0 ECU
  "12": { home: "5", away: "1" }, // SWE 5-1 TUN
  "13": { home: "0", away: "0" }, // ESP 0-0 CPV
  "14": { home: "1", away: "1" }, // BEL 1-1 EGY
  "15": { home: "1", away: "1" }, // KSA 1-1 URU
  "16": { home: "2", away: "2" }, // IRN 2-2 NZL
  "17": { home: "3", away: "1" }, // FRA 3-1 SEN
  "18": { home: "1", away: "4" }, // IRQ 1-4 NOR
  "19": { home: "3", away: "0" }, // ARG 3-0 ALG
  "20": { home: "3", away: "1" }, // AUT 3-1 JOR
  "21": { home: "1", away: "1" }, // POR 1-1 COD
  "22": { home: "4", away: "2" }, // ENG 4-2 CRO
  "23": { home: "1", away: "0" }, // GHA 1-0 PAN
  "24": { home: "1", away: "3" }, // UZB 1-3 COL
  // ── Matchday 2 ──────────────────────────────────────────────────────────
  "25": { home: "1", away: "1" }, // CZE 1-1 RSA
  "26": { home: "4", away: "1" }, // SUI 4-1 BIH
  "27": { home: "6", away: "0" }, // CAN 6-0 QAT
  "28": { home: "1", away: "0" }, // MEX 1-0 KOR
  "29": { home: "2", away: "0" }, // USA 2-0 AUS
  "30": { home: "0", away: "1" }, // SCO 0-1 MAR
  "31": { home: "3", away: "0" }, // BRA 3-0 HAI
  "32": { home: "0", away: "1" }, // TUR 0-1 PAR
  "33": { home: "5", away: "1" }, // NED 5-1 SWE
  "34": { home: "2", away: "1" }, // GER 2-1 CIV
  "35": { home: "0", away: "0" }, // ECU 0-0 CUR
  "36": { home: "0", away: "4" }, // TUN 0-4 JPN
  "37": { home: "4", away: "0" }, // ESP 4-0 KSA
  "38": { home: "0", away: "0" }, // BEL 0-0 IRN
  "39": { home: "2", away: "0" }, // URU 2-0 CPV
  "40": { home: "1", away: "3" }, // NZL 1-3 EGY
};

function getEdgeConfigId(): string {
  const raw = process.env.EDGE_CONFIG ?? "";
  const match = raw.match(/edge-config\.vercel\.com\/(ecfg_[^?]+)/);
  return match?.[1] ?? "";
}

export async function GET() {
  try {
    const stored = await get<Record<string, { home: string; away: string }>>(EC_KEY);
    // Merge: hardcoded base, Edge Config on top
    const merged = { ...HARDCODED_SCORES, ...(stored ?? {}) };
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json(HARDCODED_SCORES);
  }
}

export async function POST(req: Request) {
  try {
    const { matchNumber, side, value } = (await req.json()) as {
      matchNumber: number;
      side: "home" | "away";
      value: string;
    };

    const current: Record<string, { home: string; away: string }> =
      (await get<Record<string, { home: string; away: string }>>(EC_KEY)) ?? {};

    if (!current[matchNumber]) current[matchNumber] = { home: "", away: "" };
    current[matchNumber][side] = String(value).replace(/[^0-9]/g, "").slice(0, 2);

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
