import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

const KEY = "wc2026:scores";

export async function GET() {
  try {
    const scores = await kv.get<Record<string, { home: string; away: string }>>(KEY);
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
    const current = (await kv.get<Record<string, { home: string; away: string }>>(KEY)) ?? {};
    if (!current[matchNumber]) current[matchNumber] = { home: "", away: "" };
    current[matchNumber][side] = String(value).replace(/[^0-9]/g, "").slice(0, 2);
    await kv.set(KEY, current);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
