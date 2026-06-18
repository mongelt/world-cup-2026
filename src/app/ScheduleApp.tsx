"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Match } from "@/lib/schedule";

type ScoreState = Record<number, { home: string; away: string }>;
type GroupTeam = { iso: string; code: string; name: string };
type GroupData = Record<string, GroupTeam[]>;
type View = "today" | "chart" | "list" | "standings" | "wildcard" | "bracket";
type GameStatus = "finished" | "live" | "upcoming";

const MATCH_CARD_MIN_WIDTH = 860;

interface Props {
  matches: Match[];
  groups: GroupData;
  chartDays: string[];
  groupStageMatches: Match[];
}

interface StandingRow {
  iso: string;
  code: string;
  name: string;
  group: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

// ── Bracket topology (extracted from poster.html M array) ────────────────────
// R32: [matchNumber, seed1, seed2, venueId, date, timeRaw]
// seed like "1A" = group-A winner, "2B" = group-B runner-up, "3rd" = wildcard slot
const R32_TOPOLOGY: [number, string, string, string, string, string][] = [
  [73,  "2A",  "2B",  "LAX", "6/28", "3p"],
  [74,  "1E",  "3rd", "BOS", "6/29", "4:30p"],
  [75,  "1F",  "2C",  "MTY", "6/29", "9p"],
  [76,  "1C",  "2F",  "HOU", "6/29", "1p"],
  [77,  "1I",  "3rd", "NYC", "6/30", "5p"],
  [78,  "2E",  "2I",  "DAL", "6/30", "1p"],
  [79,  "1A",  "3rd", "MEX", "6/30", "9p"],
  [80,  "1L",  "3rd", "ATL", "7/1",  "12p"],
  [81,  "1D",  "3rd", "SFO", "7/1",  "8p"],
  [82,  "1G",  "3rd", "SEA", "7/1",  "4p"],
  [83,  "2K",  "2L",  "TOR", "7/2",  "7p"],
  [84,  "1H",  "2J",  "LAX", "7/2",  "3p"],
  [85,  "1B",  "3rd", "VAN", "7/2",  "11p"],
  [86,  "1J",  "2H",  "MIA", "7/3",  "6p"],
  [87,  "1K",  "3rd", "KCM", "7/3",  "9:30"],
  [88,  "2D",  "2G",  "DAL", "7/3",  "2p"],
];

// R16: [matchNumber, feeder1, feeder2, venueId, date, timeRaw]
const R16_TOPOLOGY: [number, string, string, string, string, string][] = [
  [89,  "W74", "W77", "PHI", "7/4",  "5p"],
  [90,  "W73", "W75", "HOU", "7/4",  "1p"],
  [91,  "W76", "W78", "NYC", "7/5",  "4p"],
  [92,  "W79", "W80", "MEX", "7/5",  "8p"],
  [93,  "W83", "W84", "DAL", "7/6",  "3p"],
  [94,  "W81", "W82", "SEA", "7/6",  "8p"],
  [95,  "W86", "W88", "ATL", "7/7",  "12p"],
  [96,  "W85", "W87", "VAN", "7/7",  "4p"],
];

const QF_TOPOLOGY: [number, string, string, string, string, string][] = [
  [97,  "W89",  "W90",  "BOS", "7/9",  "4p"],
  [98,  "W93",  "W94",  "LAX", "7/10", "3p"],
  [99,  "W91",  "W92",  "MIA", "7/11", "5p"],
  [100, "W95",  "W96",  "KCM", "7/11", "9p"],
];

const SF_TOPOLOGY: [number, string, string, string, string, string][] = [
  [101, "W97",  "W98",  "DAL", "7/14", "3p"],
  [102, "W99",  "W100", "ATL", "7/15", "3p"],
];

const FINAL_TOPOLOGY: [number, string, string, string, string, string][] = [
  [103, "L101", "L102", "MIA", "7/18", "5p"],  // 3rd place
  [104, "W101", "W102", "NYC", "7/19", "3p"],  // Final
];

// ── Utility helpers ───────────────────────────────────────────────────────────
function shortDate(key: string) {
  const [m, d] = key.split("/").map(Number);
  return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function weekday(key: string) {
  const [m, d] = key.split("/").map(Number);
  return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
function longDate(key: string) {
  const [m, d] = key.split("/").map(Number);
  return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function todayKeyET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${et.getMonth() + 1}/${et.getDate()}`;
}
function kickoffMinutesET(timeRaw: string): number | null {
  const m = timeRaw.match(/^(\d{1,2})(?::(\d{2}))?([ap])$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] ?? "0", 10);
  if (m[3] === "p" && h !== 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return h * 60 + min;
}
function nowMinutesET(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.getHours() * 60 + et.getMinutes();
}
function parseTime(raw: string): string {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?([ap])$/);
  if (!m) return raw;
  return `${m[1]}:${m[2] ?? "00"} ${m[3] === "a" ? "AM" : "PM"} ET`;
}
function gameStatus(timeRaw: string, matchDate: string): GameStatus {
  const today = todayKeyET();
  if (matchDate !== today) return "upcoming";
  const kickoff = kickoffMinutesET(timeRaw);
  if (kickoff === null) return "upcoming";
  const elapsed = nowMinutesET() - kickoff;
  if (elapsed >= 120) return "finished";
  if (elapsed >= 0) return "live";
  return "upcoming";
}
function statusTint(status: GameStatus): React.CSSProperties {
  if (status === "finished") return { background: "rgba(200,196,193,0.55)", opacity: 0.82 };
  if (status === "live") return { background: "rgba(107,42,42,0.13)", boxShadow: "0 0 0 2px rgba(107,42,42,0.35)" };
  return {};
}

function StatusBadge({ status }: { status: GameStatus }) {
  if (status === "upcoming") return null;
  const isLive = status === "live";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: "0.65rem", fontFamily: "var(--font-ui)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: isLive ? "var(--accent)" : "rgba(120,116,113,0.18)", color: isLive ? "#fff" : "var(--text-meta)", border: isLive ? "none" : "1px solid rgba(120,116,113,0.3)" }}>
      {isLive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff6b6b", display: "inline-block" }} />}
      {isLive ? "Live" : "FT"}
    </span>
  );
}

function Flag({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={22} height={16} loading="lazy" style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }} />;
}

function HScrollList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto", overflowY: "visible", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"], paddingBottom: 4 }}>
      <div style={{ minWidth: MATCH_CARD_MIN_WIDTH, display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

export default function ScheduleApp({ matches, groups, chartDays, groupStageMatches }: Props) {
  const [view, setView] = useState<View>("today");
  const [scores, setScores] = useState<ScoreState>({});
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("A");
  const [nowMin, setNowMin] = useState(nowMinutesET);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinutesET()), 60_000);
    return () => clearInterval(id);
  }, []);
  void nowMin;

  useEffect(() => {
    fetch("/api/scores")
      .then((r) => r.json())
      .then((data: ScoreState) => setScores(data ?? {}));
  }, []);

  const setScore = useCallback((matchNumber: number, side: "home" | "away", value: string) => {
    const clean = value.replace(/[^0-9]/g, "").slice(0, 2);
    setScores((prev) => ({ ...prev, [matchNumber]: { ...(prev[matchNumber] ?? { home: "", away: "" }), [side]: clean } }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchNumber, side, value: clean }) });
    }, 600);
  }, []);

  const groupLetters = Object.keys(groups);

  // ── Shared standings builder ─────────────────────────────────────────────────
  function buildGroupTable(group: string): StandingRow[] {
    const groupTeams = groups[group] ?? [];
    const table: StandingRow[] = groupTeams.map(({ iso, code, name }) => ({
      iso, code, name, group, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0
    }));
    const lookup = Object.fromEntries(table.map((t) => [t.code, t]));
    groupStageMatches
      .filter((m) => m.group === group)
      .sort((a, b) => a.matchNumber - b.matchNumber)
      .forEach((match) => {
        const state = scores[match.matchNumber];
        if (!state || state.home === "" || state.away === "") return;
        const hg = Number(state.home), ag = Number(state.away);
        if (Number.isNaN(hg) || Number.isNaN(ag)) return;
        const home = lookup[match.homeCode!], away = lookup[match.awayCode!];
        if (!home || !away) return;
        home.played++; away.played++;
        home.gf += hg; home.ga += ag; away.gf += ag; away.ga += hg;
        if (hg > ag) { home.wins++; away.losses++; home.points += 3; }
        else if (ag > hg) { away.wins++; home.losses++; away.points += 3; }
        else { home.draws++; away.draws++; home.points++; away.points++; }
      });
    table.forEach((t) => { t.gd = t.gf - t.ga; });
    table.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
    return table;
  }

  // ── Bracket seed resolver ─────────────────────────────────────────────────────
  // Resolves a seed string like "1A", "2B", "3rd" (wildcard rank 1-8)
  // or a match feeder like "W74", "L101" into { code, iso, label }.
  function resolveTeam(seed: string, bracketResults: Map<number, { winner: StandingRow | null; loser: StandingRow | null }>): { code: string; iso: string; label: string } | null {
    // Group winner/runner-up: "1A" = winner of group A, "2A" = runner-up
    const groupMatch = seed.match(/^([12])([A-L])$/);
    if (groupMatch) {
      const pos = parseInt(groupMatch[1], 10) - 1; // 0 = winner, 1 = runner-up
      const table = buildGroupTable(groupMatch[2]);
      const team = table[pos];
      if (!team || team.played === 0) return { code: seed, iso: "", label: seed };
      return { code: team.code, iso: team.iso, label: team.code };
    }
    // Wildcard feeder — not a direct seed, handled by bracket render
    if (seed === "3rd") return null;
    // Match winner/loser: "W74", "L101"
    const feedMatch = seed.match(/^([WL])(\d+)$/);
    if (feedMatch) {
      const matchNum = parseInt(feedMatch[2], 10);
      const result = bracketResults.get(matchNum);
      if (!result) return { code: seed, iso: "", label: seed };
      const team = feedMatch[1] === "W" ? result.winner : result.loser;
      if (!team) return { code: seed, iso: "", label: seed };
      return { code: team.code, iso: team.iso, label: team.code };
    }
    return { code: seed, iso: "", label: seed };
  }

  // Builds a map of matchNumber → { winner, loser } from bracket scores
  function buildBracketResults(
    wildcardSlots: (StandingRow | null)[]
  ): Map<number, { winner: StandingRow | null; loser: StandingRow | null }> {
    const results = new Map<number, { winner: StandingRow | null; loser: StandingRow | null }>();

    // Helper to get team from a seed string within bracket context
    function getTeamForSeed(seed: string, isHome: boolean, matchRow: [number, string, string, string, string, string]): StandingRow | null {
      const wcIdx = isHome ? 0 : 1; // track wildcard assignment order
      void wcIdx;
      if (seed === "3rd") {
        // Find which wildcard slot index this R32 match is among the 8 wildcard matches
        const wcMatches = R32_TOPOLOGY.filter((r) => r[1] === "3rd" || r[2] === "3rd");
        const myIdx = wcMatches.findIndex((r) => r[0] === matchRow[0]);
        return wildcardSlots[myIdx] ?? null;
      }
      const groupMatch = seed.match(/^([12])([A-L])$/);
      if (groupMatch) {
        const pos = parseInt(groupMatch[1], 10) - 1;
        const table = buildGroupTable(groupMatch[2]);
        return table[pos] ?? null;
      }
      const feedMatch = seed.match(/^([WL])(\d+)$/);
      if (feedMatch) {
        const num = parseInt(feedMatch[2], 10);
        const r = results.get(num);
        if (!r) return null;
        return feedMatch[1] === "W" ? r.winner : r.loser;
      }
      return null;
    }

    const allTopology = [...R32_TOPOLOGY, ...R16_TOPOLOGY, ...QF_TOPOLOGY, ...SF_TOPOLOGY, ...FINAL_TOPOLOGY];
    for (const row of allTopology) {
      const [matchNum, seed1, seed2] = row;
      const state = scores[matchNum];
      const homeTeam = getTeamForSeed(seed1, true, row);
      const awayTeam = getTeamForSeed(seed2, false, row);
      if (!state || state.home === "" || state.away === "") {
        results.set(matchNum, { winner: null, loser: null });
        continue;
      }
      const hg = Number(state.home), ag = Number(state.away);
      if (Number.isNaN(hg) || Number.isNaN(ag)) { results.set(matchNum, { winner: null, loser: null }); continue; }
      if (hg > ag) results.set(matchNum, { winner: homeTeam, loser: awayTeam });
      else if (ag > hg) results.set(matchNum, { winner: awayTeam, loser: homeTeam });
      else results.set(matchNum, { winner: null, loser: null }); // draw — no winner yet
    }
    return results;
  }

  function ScoreInputs({ matchNumber, compact = false }: { matchNumber: number; compact?: boolean }) {
    const state = scores[matchNumber] ?? { home: "", away: "" };
    const inputStyle: React.CSSProperties = { width: compact ? 40 : 44, height: 38, borderRadius: 10, textAlign: "center", fontWeight: 700, border: "1px solid rgba(107,42,42,0.22)", background: "#fff", color: "var(--text)", fontSize: "0.9rem" };
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: compact ? "flex-end" : "center", marginTop: compact ? 0 : 8 }}>
        <input style={inputStyle} inputMode="numeric" value={state.home} aria-label={`Match ${matchNumber} home score`} onChange={(e) => setScore(matchNumber, "home", e.target.value)} />
        <span style={{ color: "var(--text-meta)", fontSize: "0.8rem", fontFamily: "var(--font-ui)" }}>–</span>
        <input style={inputStyle} inputMode="numeric" value={state.away} aria-label={`Match ${matchNumber} away score`} onChange={(e) => setScore(matchNumber, "away", e.target.value)} />
      </div>
    );
  }

  function MatchCard({ match, showDate = false }: { match: Match; showDate?: boolean }) {
    const status = gameStatus(match.timeRaw, match.date);
    const tint = statusTint(status);
    return (
      <article style={{ display: "grid", gridTemplateColumns: "96px minmax(220px,1.2fr) minmax(160px,1fr) minmax(140px,.8fr) minmax(120px,.7fr) auto", gap: 10, alignItems: "center", minWidth: MATCH_CARD_MIN_WIDTH, background: "rgba(255,255,255,0.74)", border: "1px solid var(--border-card)", borderRadius: 16, padding: "12px 14px", transition: "background 0.3s ease, box-shadow 0.3s ease", ...tint }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem", color: "var(--accent)", fontWeight: 700 }}>Match #{match.matchNumber}</span>
          <StatusBadge status={status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, color: "var(--text)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Flag src={match.homeFlag} alt={match.homeName} /><span style={{ fontSize: "0.9rem" }}>{match.homeDisplay}</span></div>
          <span style={{ color: "var(--text-meta)", fontSize: "0.8rem" }}>v</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: "0.9rem" }}>{match.awayDisplay}</span><Flag src={match.awayFlag} alt={match.awayName} /></div>
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{showDate ? longDate(match.date) : match.timeLabel}</div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{match.city} · {match.stadium}</div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.78rem", color: "var(--text-meta)", textTransform: "uppercase" }}>{match.stageLabel}</div>
        <ScoreInputs matchNumber={match.matchNumber} compact />
      </article>
    );
  }

  function TodayView() {
    const today = todayKeyET();
    const todayMatches = matches.filter((m) => m.date === today).sort((a, b) => (kickoffMinutesET(a.timeRaw) ?? 0) - (kickoffMinutesET(b.timeRaw) ?? 0));
    const nextDay = todayMatches.length === 0
      ? [...new Set(matches.map((m) => m.date))].sort((a, b) => { const [am,ad]=a.split("/").map(Number),[bm,bd]=b.split("/").map(Number); return am!==bm?am-bm:ad-bd; }).find((d) => { const [dm,dd]=d.split("/").map(Number),[tm,td]=today.split("/").map(Number); return dm>tm||(dm===tm&&dd>td); }) : null;
    const etNow = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-ui)" }}>{longDate(today)}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-meta)", fontFamily: "var(--font-ui)", marginTop: 2 }}>Current time: {etNow} ET</div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: "0.72rem", fontFamily: "var(--font-ui)", color: "var(--text-meta)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(107,42,42,0.13)", border: "1px solid rgba(107,42,42,0.35)", display: "inline-block" }} />Live</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(200,196,193,0.55)", border: "1px solid rgba(120,116,113,0.3)", display: "inline-block" }} />Finished</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(255,255,255,0.74)", border: "1px solid var(--border-card)", display: "inline-block" }} />Upcoming</span>
          </div>
        </div>
        {todayMatches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-meta)", fontFamily: "var(--font-ui)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⚽</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No matches today</div>
            {nextDay && <div style={{ fontSize: "0.88rem" }}>Next match day: <strong>{longDate(nextDay)}</strong></div>}
          </div>
        ) : (
          <HScrollList>{todayMatches.map((m) => <MatchCard key={m.matchNumber} match={m} />)}</HScrollList>
        )}
      </div>
    );
  }

  function ChartView() {
    const colCount = chartDays.length;
    const COL_W = 164;
    return (
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: `130px repeat(${colCount}, minmax(${COL_W}px, 1fr))`, minWidth: 130 + colCount * COL_W, border: "1px solid var(--border-card)", borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.22)" }}>
          <div style={{ background: "#1a1618", color: "#e0e0e0", padding: "12px 10px", fontFamily: "var(--font-ui)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Group / Day</div>
          {chartDays.map((day) => (
            <div key={day} style={{ background: "#d8d0cc", padding: "10px 8px", borderLeft: "1px solid rgba(46,42,40,0.14)", borderBottom: "1px solid rgba(46,42,40,0.14)" }}>
              <strong style={{ display: "block", color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: "0.75rem", textTransform: "uppercase" }}>{shortDate(day)}</strong>
              <span style={{ display: "block", marginTop: 3, color: "var(--text-meta)", fontSize: "0.75rem" }}>{weekday(day)}</span>
            </div>
          ))}
          {groupLetters.map((group) => (
            <>
              <div key={`g-${group}`} style={{ background: "#d5cbc7", padding: "12px 10px", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", color: "var(--text)", borderTop: "1px solid rgba(46,42,40,0.14)", position: "sticky", left: 0, zIndex: 2 }}>Group {group}</div>
              {chartDays.map((day) => {
                const dayMatches = groupStageMatches.filter((m) => m.group === group && m.date === day);
                return (
                  <div key={`${group}-${day}`} style={{ background: "rgba(255,255,255,0.32)", padding: 8, borderLeft: "1px solid rgba(46,42,40,0.14)", borderTop: "1px solid rgba(46,42,40,0.14)", minHeight: 90 }}>
                    {dayMatches.map((match) => {
                      const status = gameStatus(match.timeRaw, match.date);
                      return (
                        <div key={match.matchNumber} style={{ background: "rgba(255,255,255,0.82)", border: "1px solid var(--border-card)", borderRadius: 14, padding: "8px 10px", marginBottom: 6, transition: "background 0.3s ease, box-shadow 0.3s ease", ...statusTint(status) }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontFamily: "var(--font-ui)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-meta)" }}>
                            <span>#{match.matchNumber}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><StatusBadge status={status} /><span>{match.timeLabel}</span></div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}><Flag src={match.homeFlag} alt={match.homeName} /><span style={{ fontWeight: 800, color: "var(--text)" }}>{match.homeCode}</span></div>
                            <span style={{ color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: "0.68rem", flexShrink: 0, padding: "0 2px" }}>v</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, justifyContent: "flex-end" }}><span style={{ fontWeight: 800, color: "var(--text)" }}>{match.awayCode}</span><Flag src={match.awayFlag} alt={match.awayName} /></div>
                          </div>
                          <ScoreInputs matchNumber={match.matchNumber} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    );
  }

  function ListView() {
    const q = search.trim().toLowerCase();
    const filtered = matches.filter((m) => !q || [m.matchNumber, m.homeDisplay, m.awayDisplay, m.homeName, m.awayName, m.stageLabel, m.city, m.stadium, m.venueId, m.date].join(" ").toLowerCase().includes(q));
    return <HScrollList>{filtered.map((m) => <MatchCard key={m.matchNumber} match={m} showDate />)}</HScrollList>;
  }

  function StandingsView() {
    const table = buildGroupTable(activeGroup);
    const relevant = groupStageMatches.filter((m) => m.group === activeGroup).sort((a, b) => a.matchNumber - b.matchNumber);
    return (
      <div className="wc-standings-layout" style={{ display: "grid", gridTemplateColumns: "minmax(240px,280px) 1fr", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 8 }}>
          {groupLetters.map((g) => (
            <button key={g} onClick={() => setActiveGroup(g)} style={{ minHeight: 44, padding: "10px 16px", borderRadius: 999, border: "1px solid var(--border-card)", background: g === activeGroup ? "var(--accent)" : "rgba(255,255,255,0.6)", color: g === activeGroup ? "#fff" : "var(--text)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.85rem" }}>Group {g}</button>
          ))}
        </aside>
        <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-card)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text)" }}>Group {activeGroup} Standings</h3>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-meta)", textTransform: "uppercase" }}>Win 3pts · Draw 1pt · Loss 0pts</span>
          </div>
          <table>
            <thead><tr>{["Team","P","W","D","L","GF","GA","GD","Pts"].map((h) => <th key={h} style={{ padding: "10px 8px", fontSize: "0.72rem", fontFamily: "var(--font-ui)", textTransform: "uppercase", color: "var(--text-meta)", background: "rgba(215,205,202,0.55)", textAlign: h === "Team" ? "left" : "center" }}>{h}</th>)}</tr></thead>
            <tbody>
              {table.map((team) => (
                <tr key={team.code} style={{ borderBottom: "1px solid rgba(46,42,40,0.1)" }}>
                  <td style={{ padding: "10px 8px" }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`https://flagcdn.com/w40/${team.iso}.png`} alt={team.name} width={22} height={16} loading="lazy" style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover" }} /><span>{team.code} · {team.name}</span></div></td>
                  {[team.played,team.wins,team.draws,team.losses,team.gf,team.ga,team.gd].map((v,i)=><td key={i} style={{ textAlign: "center", padding: "10px 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{v}</td>)}
                  <td style={{ textAlign: "center", padding: "10px 6px", fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>{team.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "14px 16px", display: "grid", gap: 10, borderTop: "1px solid var(--border-card)" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-meta)", letterSpacing: "0.05em", marginBottom: 4 }}>Enter scores</div>
            {relevant.map((match) => (
              <div key={match.matchNumber} style={{ display: "grid", gridTemplateColumns: "64px 1fr 104px 1fr", gap: 8, alignItems: "center", background: "rgba(255,255,255,0.74)", border: "1px solid var(--border-card)", borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--accent)" }}>#{match.matchNumber}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.85rem" }}><Flag src={match.homeFlag} alt={match.homeName} />{match.homeCode}</div>
                <ScoreInputs matchNumber={match.matchNumber} compact />
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.85rem", justifyContent: "flex-end" }}>{match.awayCode}<Flag src={match.awayFlag} alt={match.awayName} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function WildcardView() {
    const thirdPlaceTeams: StandingRow[] = groupLetters.map((g) => buildGroupTable(g)[2]).filter(Boolean) as StandingRow[];
    thirdPlaceTeams.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
    const advanceCount = 8;
    const totalGroups = groupLetters.length;
    const playedCount = thirdPlaceTeams.filter((t) => t.played > 0).length;
    const thHeaders = ["#","Team","Group","P","W","D","L","GF","GA","GD","Pts","Status"];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(107,42,42,0.07)", border: "1px solid rgba(107,42,42,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
          <span style={{ fontSize: "1.4rem", lineHeight: 1, flexShrink: 0 }}>🃏</span>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>8 wildcards advance</strong> from the 12 third-place finishers. Rankings update live as scores are entered.
            {thirdPlaceTeams.length < totalGroups && playedCount < totalGroups && <span style={{ color: "var(--text-meta)" }}> · {totalGroups - thirdPlaceTeams.length > 0 ? `${totalGroups - thirdPlaceTeams.length} groups not yet started` : `${totalGroups - playedCount} groups have no scores yet`}</span>}
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden" }}>
          <table style={{ width: "100%" }}>
            <thead><tr>{thHeaders.map((h) => <th key={h} style={{ padding: "10px 8px", fontSize: "0.72rem", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-meta)", background: "rgba(215,205,202,0.55)", textAlign: (h==="Team"||h==="Status") ? "left" : "center", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {thirdPlaceTeams.length === 0 ? (
                <tr><td colSpan={thHeaders.length} style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-meta)", fontFamily: "var(--font-ui)", fontSize: "0.9rem" }}>⚽ Waiting for group stage scores — enter results in Standings or Chart view.</td></tr>
              ) : (
                thirdPlaceTeams.map((team, idx) => {
                  const advances = idx < advanceCount;
                  return (
                    <>
                      {idx === advanceCount && thirdPlaceTeams.length > advanceCount && <tr key="cutline"><td colSpan={thHeaders.length} style={{ padding: 0, height: 2, borderTop: "2px dashed rgba(107,42,42,0.4)" }} /></tr>}
                      <tr key={team.code} style={{ borderBottom: "1px solid rgba(46,42,40,0.1)", background: advances ? "rgba(107,42,42,0.04)" : "rgba(200,196,193,0.22)", opacity: advances ? 1 : 0.72 }}>
                        <td style={{ textAlign: "center", padding: "10px 8px", fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.95rem", color: advances ? "var(--accent)" : "var(--text-meta)" }}>{idx+1}</td>
                        <td style={{ padding: "10px 8px", minWidth: 180 }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`https://flagcdn.com/w40/${team.iso}.png`} alt={team.name} width={22} height={16} loading="lazy" style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }} /><span>{team.code} · {team.name}</span></div></td>
                        <td style={{ textAlign: "center", padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>{team.group}</td>
                        {[team.played,team.wins,team.draws,team.losses,team.gf,team.ga,team.gd].map((v,i)=><td key={i} style={{ textAlign: "center", padding: "10px 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{v}</td>)}
                        <td style={{ textAlign: "center", padding: "10px 6px", fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>{team.points}</td>
                        <td style={{ padding: "10px 10px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, fontFamily: "var(--font-ui)", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", background: advances ? "rgba(107,42,42,0.12)" : "rgba(180,170,165,0.28)", color: advances ? "var(--accent)" : "var(--text-meta)", border: `1px solid ${advances ? "rgba(107,42,42,0.3)" : "rgba(120,116,113,0.2)"}` }}>{advances ? "✓ Advance" : "Eliminated"}</span></td>
                      </tr>
                    </>
                  );
                })
              )}
            </tbody>
          </table>
          {thirdPlaceTeams.length > 0 && thirdPlaceTeams.length < totalGroups && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-card)", fontFamily: "var(--font-ui)", fontSize: "0.78rem", color: "var(--text-meta)" }}>Showing {thirdPlaceTeams.length} of {totalGroups} groups — {totalGroups - thirdPlaceTeams.length} group{totalGroups - thirdPlaceTeams.length !== 1 ? "s" : ""} not yet started.</div>
          )}
        </div>
      </div>
    );
  }

  // ── Bracket View ──────────────────────────────────────────────────────────────
  function BracketView() {
    // Compute wildcards (top 8 third-place teams)
    const thirdPlaceTeams: StandingRow[] = groupLetters.map((g) => buildGroupTable(g)[2]).filter(Boolean) as StandingRow[];
    thirdPlaceTeams.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
    const wildcardSlots: (StandingRow | null)[] = Array.from({ length: 8 }, (_, i) => thirdPlaceTeams[i] ?? null);

    // Build match result map from entered scores
    const bracketResults = buildBracketResults(wildcardSlots);
    void resolveTeam; // used indirectly

    // Helper to get the prefilled team object for a seed within a bracket match
    function getSlot(seed: string, matchRow: [number, string, string, string, string, string]): { code: string; iso: string } | null {
      if (seed === "3rd") {
        const wcMatches = R32_TOPOLOGY.filter((r) => r[1] === "3rd" || r[2] === "3rd");
        const myIdx = wcMatches.findIndex((r) => r[0] === matchRow[0]);
        const wc = wildcardSlots[myIdx] ?? null;
        return wc ? { code: wc.code, iso: wc.iso } : null;
      }
      const gm = seed.match(/^([12])([A-L])$/);
      if (gm) {
        const table = buildGroupTable(gm[2]);
        const team = table[parseInt(gm[1], 10) - 1];
        return team ? { code: team.code, iso: team.iso } : null;
      }
      const fm = seed.match(/^([WL])(\d+)$/);
      if (fm) {
        const r = bracketResults.get(parseInt(fm[2], 10));
        if (!r) return null;
        const team = fm[1] === "W" ? r.winner : r.loser;
        return team ? { code: team.code, iso: team.iso } : null;
      }
      return null;
    }

    // BracketSlot: renders one team row inside a bracket card
    function BracketSlot({ seed, matchRow, isWinner }: { seed: string; matchRow: [number, string, string, string, string, string]; isWinner: boolean }) {
      const team = getSlot(seed, matchRow);
      const state = scores[matchRow[0]];
      const scoreVal = state ? (seed === matchRow[1] ? state.home : state.away) : "";
      return (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 10px",
          background: isWinner ? "rgba(107,42,42,0.07)" : "transparent",
          borderRadius: 8,
          fontWeight: isWinner ? 800 : 500,
          color: isWinner ? "var(--text)" : "var(--text-secondary)",
          fontSize: "0.8rem"
        }}>
          {team?.iso
            ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`https://flagcdn.com/w40/${team.iso}.png`} alt={team.code} width={18} height={13} loading="lazy" style={{ borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }} /></>
            : <span style={{ width: 18, height: 13, borderRadius: 2, background: "rgba(180,170,165,0.3)", display: "inline-block", flexShrink: 0 }} />
          }
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {team ? team.code : (seed === "3rd" ? "WC" : seed)}
          </span>
          {scoreVal !== "" && (
            <span style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.85rem", color: isWinner ? "var(--accent)" : "var(--text-meta)", minWidth: 16, textAlign: "right" }}>{scoreVal}</span>
          )}
        </div>
      );
    }

    // Determine which team won for highlighting
    function winnerSide(matchNum: number): "home" | "away" | null {
      const state = scores[matchNum];
      if (!state || state.home === "" || state.away === "") return null;
      const h = Number(state.home), a = Number(state.away);
      if (h > a) return "home";
      if (a > h) return "away";
      return null;
    }

    // Single bracket match card
    function BracketCard({ row, label }: { row: [number, string, string, string, string, string]; label?: string }) {
      const [matchNum, seed1, seed2,, date, timeRaw] = row;
      const ws = winnerSide(matchNum);
      const status = gameStatus(timeRaw, date);
      return (
        <div style={{
          background: "rgba(255,255,255,0.78)",
          border: `1px solid ${status === "live" ? "rgba(107,42,42,0.5)" : "var(--border-card)"}`,
          borderRadius: 12, overflow: "hidden", minWidth: 160, maxWidth: 200,
          boxShadow: status === "live" ? "0 0 0 2px rgba(107,42,42,0.25)" : "var(--shadow-sm)",
          transition: "box-shadow 0.2s ease"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 10px", background: "rgba(215,205,202,0.4)", fontSize: "0.65rem", fontFamily: "var(--font-ui)", color: "var(--text-meta)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>#{matchNum}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {status !== "upcoming" && <StatusBadge status={status} />}
              <span>{shortDate(date)}</span>
            </div>
          </div>
          {label && <div style={{ padding: "2px 10px", fontSize: "0.6rem", fontFamily: "var(--font-ui)", color: "var(--text-meta)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(107,42,42,0.05)" }}>{label}</div>}
          <div style={{ borderTop: "1px solid rgba(46,42,40,0.08)" }}>
            <BracketSlot seed={seed1} matchRow={row} isWinner={ws === "home"} />
            <div style={{ height: 1, background: "rgba(46,42,40,0.07)", margin: "0 10px" }} />
            <BracketSlot seed={seed2} matchRow={row} isWinner={ws === "away"} />
          </div>
          {/* Score input inline */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center", padding: "6px 10px 8px", borderTop: "1px solid rgba(46,42,40,0.07)" }}>
            <input
              inputMode="numeric" value={scores[matchNum]?.home ?? ""}
              onChange={(e) => setScore(matchNum, "home", e.target.value)}
              aria-label={`Match ${matchNum} home`}
              style={{ width: 34, height: 30, borderRadius: 8, textAlign: "center", fontWeight: 700, border: "1px solid rgba(107,42,42,0.22)", background: "#fff", color: "var(--text)", fontSize: "0.8rem" }}
            />
            <span style={{ color: "var(--text-meta)", fontSize: "0.7rem" }}>–</span>
            <input
              inputMode="numeric" value={scores[matchNum]?.away ?? ""}
              onChange={(e) => setScore(matchNum, "away", e.target.value)}
              aria-label={`Match ${matchNum} away`}
              style={{ width: 34, height: 30, borderRadius: 8, textAlign: "center", fontWeight: 700, border: "1px solid rgba(107,42,42,0.22)", background: "#fff", color: "var(--text)", fontSize: "0.8rem" }}
            />
          </div>
        </div>
      );
    }

    // Stage column header
    function StageHeader({ label, count }: { label: string; count: string }) {
      return (
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>{label}</div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.68rem", color: "var(--text-meta)", marginTop: 2 }}>{count}</div>
        </div>
      );
    }

    // Grid of bracket cards for a round
    function RoundColumn({ topology, label, count }: { topology: [number,string,string,string,string,string][]; label: string; count: string }) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 168 }}>
          <StageHeader label={label} count={count} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, justifyContent: "space-around" }}>
            {topology.map((row) => <BracketCard key={row[0]} row={row} />)}
          </div>
        </div>
      );
    }

    // Special final column with 3rd place + Final
    function FinalColumn() {
      const thirdRow = FINAL_TOPOLOGY[0];
      const finalRow = FINAL_TOPOLOGY[1];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 168 }}>
          <StageHeader label="Final" count="Jul 18–19" />
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, justifyContent: "center" }}>
            <BracketCard row={finalRow} label="🏆 Final" />
            <BracketCard row={thirdRow} label="3rd Place" />
          </div>
        </div>
      );
    }

    return (
      <div>
        {/* Info banner */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(107,42,42,0.07)", border: "1px solid rgba(107,42,42,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 20, fontSize: "0.84rem", fontFamily: "var(--font-ui)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <span style={{ fontSize: "1.4rem", lineHeight: 1, flexShrink: 0 }}>🏆</span>
          <div>
            <strong style={{ color: "var(--text)" }}>32-team knockout bracket.</strong> Teams prefilled from group standings and wildcard rankings. Enter scores to advance winners automatically.
            <span style={{ color: "var(--text-meta)" }}> · Scroll horizontally to see all rounds.</span>
          </div>
        </div>

        {/* Bracket scroll container */}
        <div style={{ overflowX: "auto", overflowY: "visible", paddingBottom: 12 }}>
          <div style={{
            display: "flex",
            gap: 20,
            alignItems: "stretch",
            minWidth: 168 * 6 + 20 * 5, // 6 columns
            padding: "4px 2px 8px"
          }}>
            <RoundColumn topology={R32_TOPOLOGY} label="Round of 32" count="Jun 28 – Jul 3" />
            <RoundColumn topology={R16_TOPOLOGY} label="Round of 16" count="Jul 4–7" />
            <RoundColumn topology={QF_TOPOLOGY} label="Quarterfinals" count="Jul 9–11" />
            <RoundColumn topology={SF_TOPOLOGY} label="Semifinals" count="Jul 14–15" />
            <FinalColumn />
          </div>
        </div>

        {/* Wildcard slots legend */}
        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255,255,255,0.4)", border: "1px solid var(--border-card)", borderRadius: 14 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-meta)", marginBottom: 10 }}>Wildcard slots (WC → R32 assignment, ranked 1–8)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const wc = wildcardSlots[i];
              const wcMatches = R32_TOPOLOGY.filter((r) => r[1] === "3rd" || r[2] === "3rd");
              const m = wcMatches[i];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.7)", border: "1px solid var(--border-card)", borderRadius: 10, padding: "6px 10px", fontSize: "0.78rem", fontFamily: "var(--font-ui)" }}>
                  <span style={{ color: "var(--accent)", fontWeight: 800 }}>WC{i+1}</span>
                  <span style={{ color: "var(--text-meta)" }}>→</span>
                  <span style={{ color: "var(--text-secondary)" }}>M{m?.[0] ?? "?"}</span>
                  <span style={{ color: "var(--text-meta)"}}>vs {m?.[1] ?? "?"}</span>
                  {wc ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, color: "var(--text)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://flagcdn.com/w40/${wc.iso}.png`} alt={wc.code} width={16} height={11} loading="lazy" style={{ borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover" }} />
                      {wc.code}
                    </div>
                  ) : <span style={{ color: "var(--text-faint)" }}>TBD</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Shell ─────────────────────────────────────────────────────────────────────
  const pill = (label: string, subtle = false) => (
    <span style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 999, background: subtle ? "rgba(107,42,42,0.09)" : "rgba(255,255,255,0.06)", border: `1px solid ${subtle ? "rgba(107,42,42,0.2)" : "rgba(255,255,255,0.12)"}`, color: subtle ? "var(--accent)" : "#ccc", fontFamily: "var(--font-ui)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>{label}</span>
  );
  const viewBtn = (v: View, label: string) => (
    <button onClick={() => setView(v)} style={{ minHeight: 40, padding: "9px 16px", borderRadius: 999, border: `1px solid ${view === v ? "var(--accent)" : "rgba(255,255,255,0.16)"}`, background: view === v ? "var(--accent)" : "transparent", color: view === v ? "#fff" : "#aaa", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.8rem", transition: "all 0.15s ease" }}>{label}</button>
  );
  const panelStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid rgba(107,42,42,0.18)", borderTop: "6px solid var(--accent)", borderBottom: "3px solid var(--accent)", borderRadius: 22, overflow: "hidden", boxShadow: "var(--shadow)" };
  const headStyle: React.CSSProperties = { padding: "20px 22px 14px", borderBottom: "1px solid rgba(107,42,42,0.12)" };

  return (
    <div className="wc-app" style={{ maxWidth: 1700, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, marginBottom: 20, background: "rgba(11,10,10,0.92)", backdropFilter: "saturate(180%) blur(20px)", border: "1px solid rgba(252,84,84,0.2)", borderTop: "8px solid var(--accent)", borderRadius: 22, padding: "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.14)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#e8e8e8", fontSize: "clamp(1.7rem,2.3vw,2.7rem)", fontFamily: "var(--font-ui)", fontWeight: 700, lineHeight: 1 }}>World Cup 2026</h1>
            <div style={{ marginTop: 6, color: "#888", fontFamily: "var(--font-ui)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>104 matches · 12 groups · EST kickoff times</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {viewBtn("today", "Today")}{viewBtn("chart", "Chart")}{viewBtn("list", "All Matches")}{viewBtn("standings", "Standings")}{viewBtn("wildcard", "Wildcard")}{viewBtn("bracket", "Bracket")}
          </div>
          {pill("Scores sync across devices")}
        </div>
      </header>

      {view === "today" && <section style={panelStyle}><div style={headStyle}><h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Today’s Matches</h2><p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>All kickoff times in ET. Games tinted when live (≤120 min elapsed) or finished (&gt;120 min).</p></div><div style={{ padding: "16px 18px 22px" }}><TodayView /></div></section>}
      {view === "chart" && <section style={panelStyle}><div style={headStyle}><h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Group Stage Chart</h2><p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Groups A–L as rows, match days as columns. Score inputs sync to Edge Config.</p></div><div style={{ padding: "16px 18px 22px" }}><ChartView /></div></section>}
      {view === "list" && <section style={panelStyle}><div style={headStyle}><h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>All Matches</h2><p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Group stage through the final. Search by team, city, stage, or match number.</p></div><div style={{ padding: "16px 18px 22px" }}><div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, city, stadium, group, stage, match #…" style={{ flex: "1 1 340px", minHeight: 44, borderRadius: 12, padding: "0 14px", border: "1px solid rgba(107,42,42,0.22)", background: "#fff", color: "var(--text)", maxWidth: 440 }} />{pill(`${matches.filter((m) => { const q=search.trim().toLowerCase(); return !q||[m.matchNumber,m.homeDisplay,m.awayDisplay,m.stageLabel,m.city,m.stadium].join(" ").toLowerCase().includes(q); }).length} matches`, true)}</div><ListView /></div></section>}
      {view === "standings" && <section style={panelStyle}><div style={headStyle}><h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Group Standings</h2><p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Enter scores in the chart or list view and standings update instantly here.</p></div><div style={{ padding: "16px 18px 22px" }}><StandingsView /></div></section>}
      {view === "wildcard" && <section style={panelStyle}><div style={headStyle}><h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Wildcard — Third-Place Rankings</h2><p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>The 8 best third-place finishers across 12 groups advance to the Round of 32.</p></div><div style={{ padding: "16px 18px 22px" }}><WildcardView /></div></section>}
      {view === "bracket" && <section style={panelStyle}><div style={headStyle}><h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Playoff Bracket</h2><p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Round of 32 through the Final. Teams prefilled from group standings and wildcard rankings.</p></div><div style={{ padding: "16px 18px 22px" }}><BracketView /></div></section>}
    </div>
  );
}
