"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Match } from "@/lib/schedule";

type ScoreState = Record<number, { home: string; away: string }>;
type GroupTeam = { iso: string; code: string; name: string };
type GroupData = Record<string, GroupTeam[]>;
type View = "today" | "chart" | "list" | "standings" | "wildcard" | "bracket";
type GameStatus = "finished" | "live" | "upcoming";

const MATCH_CARD_MIN_WIDTH = 860;

const LOCKED_MATCHES = new Set([
  1,2,3,4,5,6,7,8,9,10,
  11,12,13,14,15,16,17,18,19,20,
  21,22,23,24
]);

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

// ── Bracket topology ───────────────────────────────────────────────────────
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
  [87,  "1K",  "3rd", "KCM", "7/3",  "9:30p"],
  [88,  "2D",  "2G",  "DAL", "7/3",  "2p"],
];

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
  [103, "L101", "L102", "MIA", "7/18", "5p"],
  [104, "W101", "W102", "NYC", "7/19", "3p"],
];

// ── Bracket tree structure ────────────────────────────────────────────────
// Left side:  R32(8) -> R16(4) -> QF(2) -> SF(1)
// Right side: R32(8) -> R16(4) -> QF(2) -> SF(1)  [mirrored]
// Center:     Final + 3rd place
//
// Feed map (left):  74,77->89; 73,75->90; 76,78->91; 79,80->92; 89,90->97; 91,92->99; 97,99->101
// Feed map (right): 83,84->93; 81,82->94; 86,88->95; 85,87->96; 93,94->98; 95,96->100; 98,100->102

const LEFT_R32  = [74, 77, 73, 75, 76, 78, 79, 80];
const LEFT_R16  = [89, 90, 91, 92];
const LEFT_QF   = [97, 99];
const LEFT_SF   = [101];
const RIGHT_SF  = [102];
const RIGHT_QF  = [98, 100];
const RIGHT_R16 = [93, 94, 95, 96];
const RIGHT_R32 = [83, 84, 81, 82, 86, 88, 85, 87];

const ALL_TOPOLOGY = [...R32_TOPOLOGY, ...R16_TOPOLOGY, ...QF_TOPOLOGY, ...SF_TOPOLOGY, ...FINAL_TOPOLOGY];
const TOPO_MAP = new Map(ALL_TOPOLOGY.map((r) => [r[0], r]));

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

const WILDCARD_TABLE_MIN_WIDTH = 680;

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
    if (LOCKED_MATCHES.has(matchNumber)) return;
    const clean = value.replace(/[^0-9]/g, "").slice(0, 2);
    setScores((prev) => ({ ...prev, [matchNumber]: { ...(prev[matchNumber] ?? { home: "", away: "" }), [side]: clean } }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchNumber, side, value: clean }) });
    }, 600);
  }, []);

  const groupLetters = Object.keys(groups);

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

  function resolveTeam(seed: string, bracketResults: Map<number, { winner: StandingRow | null; loser: StandingRow | null }>): { code: string; iso: string; label: string } | null {
    const groupMatch = seed.match(/^([12])([A-L])$/);
    if (groupMatch) {
      const pos = parseInt(groupMatch[1], 10) - 1;
      const table = buildGroupTable(groupMatch[2]);
      const team = table[pos];
      if (!team || team.played === 0) return { code: seed, iso: "", label: seed };
      return { code: team.code, iso: team.iso, label: team.code };
    }
    if (seed === "3rd") return null;
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

  function buildBracketResults(
    wildcardSlots: (StandingRow | null)[]
  ): Map<number, { winner: StandingRow | null; loser: StandingRow | null }> {
    const results = new Map<number, { winner: StandingRow | null; loser: StandingRow | null }>();

    function getTeamForSeed(seed: string, matchRow: [number, string, string, string, string, string]): StandingRow | null {
      if (seed === "3rd") {
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

    for (const row of ALL_TOPOLOGY) {
      const [matchNum, seed1, seed2] = row;
      const state = scores[matchNum];
      const homeTeam = getTeamForSeed(seed1, row);
      const awayTeam = getTeamForSeed(seed2, row);
      if (!state || state.home === "" || state.away === "") {
        results.set(matchNum, { winner: null, loser: null });
        continue;
      }
      const hg = Number(state.home), ag = Number(state.away);
      if (Number.isNaN(hg) || Number.isNaN(ag)) { results.set(matchNum, { winner: null, loser: null }); continue; }
      if (hg > ag) results.set(matchNum, { winner: homeTeam, loser: awayTeam });
      else if (ag > hg) results.set(matchNum, { winner: awayTeam, loser: homeTeam });
      else results.set(matchNum, { winner: null, loser: null });
    }
    return results;
  }

  function ScoreInputs({ matchNumber, compact = false }: { matchNumber: number; compact?: boolean }) {
    const state = scores[matchNumber] ?? { home: "", away: "" };
    const locked = LOCKED_MATCHES.has(matchNumber);
    const inputStyle: React.CSSProperties = {
      width: compact ? 40 : 44,
      height: 38,
      borderRadius: 10,
      textAlign: "center",
      fontWeight: 700,
      border: locked ? "1px solid rgba(120,116,113,0.2)" : "1px solid rgba(107,42,42,0.22)",
      background: locked ? "rgba(200,196,193,0.35)" : "#fff",
      color: locked ? "var(--text-meta)" : "var(--text)",
      fontSize: "0.9rem",
      cursor: locked ? "not-allowed" : "text",
      pointerEvents: locked ? "none" : "auto",
      opacity: locked ? 0.6 : 1,
    };
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: compact ? "flex-end" : "center", marginTop: compact ? 0 : 8 }}>
        <input style={inputStyle} inputMode="numeric" value={state.home} readOnly={locked} disabled={locked} aria-label={`Match ${matchNumber} home score${locked ? " (locked)" : ""}`} onChange={(e) => setScore(matchNumber, "home", e.target.value)} />
        <span style={{ color: "var(--text-meta)", fontSize: "0.8rem", fontFamily: "var(--font-ui)" }}>–</span>
        <input style={inputStyle} inputMode="numeric" value={state.away} readOnly={locked} disabled={locked} aria-label={`Match ${matchNumber} away score${locked ? " (locked)" : ""}`} onChange={(e) => setScore(matchNumber, "away", e.target.value)} />
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
            <React.Fragment key={group}>
              <div style={{ background: "#d5cbc7", padding: "12px 10px", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", color: "var(--text)", borderTop: "1px solid rgba(46,42,40,0.14)", position: "sticky", left: 0, zIndex: 2 }}>Group {group}</div>
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
            </React.Fragment>
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
          {groupLetters.map((g) => {
            const teamFlags = (groups[g] ?? []).map((t) => t.iso);
            const isActive = g === activeGroup;
            return (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  minHeight: 44,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--border-card)",
                  background: isActive ? "var(--accent)" : "rgba(255,255,255,0.6)",
                  color: isActive ? "#fff" : "var(--text)",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                }}
              >
                <span style={{ flexShrink: 0 }}>Group {g}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap", marginLeft: "auto" }}>
                  {teamFlags.map((iso) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={iso}
                      src={`https://flagcdn.com/w40/${iso}.png`}
                      alt={iso}
                      width={18}
                      height={13}
                      loading="lazy"
                      style={{
                        borderRadius: 2,
                        border: isActive ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(0,0,0,0.08)",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </aside>
        <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-card)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text)" }}>Group {activeGroup} Standings</h3>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-meta)", textTransform: "uppercase" }}>Win 3pts · Draw 1pt · Loss 0pts</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 480 }}>
              <thead><tr>{["Team","P","W","D","L","GF","GA","GD","Pts"].map((h) => <th key={h} style={{ padding: "10px 8px", fontSize: "0.72rem", fontFamily: "var(--font-ui)", textTransform: "uppercase", color: "var(--text-meta)", background: "rgba(215,205,202,0.55)", textAlign: h === "Team" ? "left" : "center", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
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
          </div>
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
    const thHeaders = ["#","Team","Grp","P","W","D","L","GF","GA","GD","Pts","Status"];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(107,42,42,0.07)", border: "1px solid rgba(107,42,42,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
          <span style={{ fontSize: "1.4rem", lineHeight: 1, flexShrink: 0 }}>🃏</span>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>8 wildcards advance</strong> from the 12 third-place finishers. Rankings update live as scores are entered.
            {thirdPlaceTeams.length < totalGroups && playedCount < totalGroups && <span style={{ color: "var(--text-meta)" }}> · {totalGroups - thirdPlaceTeams.length > 0 ? `${totalGroups - thirdPlaceTeams.length} groups not yet started` : `${totalGroups - playedCount} groups have no scores yet`}</span>}
          </div>
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
          <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden", minWidth: WILDCARD_TABLE_MIN_WIDTH }}>
            <table style={{ width: "100%" }}>
              <thead><tr>{thHeaders.map((h) => <th key={h} style={{ padding: "10px 8px", fontSize: "0.72rem", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-meta)", background: "rgba(215,205,202,0.55)", textAlign: (h==="Team"||h==="Status") ? "left" : "center", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>
                {thirdPlaceTeams.length === 0 ? (
                  <tr><td colSpan={thHeaders.length} style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-meta)", fontFamily: "var(--font-ui)", fontSize: "0.9rem" }}>⚽ Waiting for group stage scores — enter results in Standings or Chart view.</td></tr>
                ) : (
                  thirdPlaceTeams.map((team, idx) => {
                    const advances = idx < advanceCount;
                    return (
                      <React.Fragment key={team.code}>
                        {idx === advanceCount && thirdPlaceTeams.length > advanceCount && <tr key="cutline"><td colSpan={thHeaders.length} style={{ padding: 0, height: 2, borderTop: "2px dashed rgba(107,42,42,0.4)" }} /></tr>}
                        <tr style={{ borderBottom: "1px solid rgba(46,42,40,0.1)", background: advances ? "rgba(107,42,42,0.04)" : "rgba(200,196,193,0.22)", opacity: advances ? 1 : 0.72 }}>
                          <td style={{ textAlign: "center", padding: "10px 8px", fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.95rem", color: advances ? "var(--accent)" : "var(--text-meta)" }}>{idx+1}</td>
                          <td style={{ padding: "10px 8px", minWidth: 180 }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`https://flagcdn.com/w40/${team.iso}.png`} alt={team.name} width={22} height={16} loading="lazy" style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }} /><span>{team.code} · {team.name}</span></div></td>
                          <td style={{ textAlign: "center", padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>{team.group}</td>
                          {[team.played,team.wins,team.draws,team.losses,team.gf,team.ga,team.gd].map((v,i)=><td key={i} style={{ textAlign: "center", padding: "10px 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{v}</td>)}
                          <td style={{ textAlign: "center", padding: "10px 6px", fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>{team.points}</td>
                          <td style={{ padding: "10px 10px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, fontFamily: "var(--font-ui)", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", background: advances ? "rgba(107,42,42,0.12)" : "rgba(180,170,165,0.28)", color: advances ? "var(--accent)" : "var(--text-meta)", border: `1px solid ${advances ? "rgba(107,42,42,0.3)" : "rgba(120,116,113,0.2)"}` }}>{advances ? "✓ Advance" : "Eliminated"}</span></td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Bracket View ──────────────────────────────────────────────────────────
  function BracketView() {
    const thirdPlaceTeams: StandingRow[] = groupLetters.map((g) => buildGroupTable(g)[2]).filter(Boolean) as StandingRow[];
    thirdPlaceTeams.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
    const wildcardSlots: (StandingRow | null)[] = Array.from({ length: 8 }, (_, i) => thirdPlaceTeams[i] ?? null);
    const bracketResults = buildBracketResults(wildcardSlots);

    // ── Layout constants ───────────────────────────────────────────────────
    // Card dimensions (fixed width; height is content-driven but we reserve CARD_H)
    const CARD_W = 160;
    const CARD_H = 96;   // reserved height per card slot
    const ARM = 18;      // horizontal connector arm length on each side
    const COL_GAP = 8;   // gap between card-column and its connector SVG

    // Each round column is sized so that R32 (8 cards) fits with even spacing.
    // Rounds with fewer cards get proportionally taller slots so they vertically
    // centre between the pair that feed them.
    const R32_COUNT = 8;
    const SLOT_H = CARD_H + 16;         // height of one R32 slot (card + padding)
    const COL_H = R32_COUNT * SLOT_H;   // total column height = 816px

    // For a column with `n` cards, card i is centred at:
    //   cardCenterY(i, n) = (COL_H / n) * i + (COL_H / n) / 2
    function cardCenterY(i: number, n: number): number {
      const slotH = COL_H / n;
      return slotH * i + slotH / 2;
    }

    // ── TeamRow ────────────────────────────────────────────────────────────
    function TeamRow({ seed, matchRow, wcs }: {
      seed: string;
      matchRow: [number, string, string, string, string, string];
      wcs: (StandingRow | null)[];
    }) {
      if (seed === "3rd") {
        const wcMatches = R32_TOPOLOGY.filter((r) => r[1] === "3rd" || r[2] === "3rd");
        const myIdx = wcMatches.findIndex((r) => r[0] === matchRow[0]);
        const wc = wcs[myIdx];
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", minHeight: 26 }}>
            {wc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://flagcdn.com/w40/${wc.iso}.png`} alt={wc.name} width={18} height={13} loading="lazy" style={{ borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: "0.72rem", color: "var(--text)" }}>{wc.code}</span>
                <span style={{ fontSize: "0.6rem", color: "var(--text-meta)", fontFamily: "var(--font-ui)" }}>3rd</span>
              </>
            ) : (
              <span style={{ fontSize: "0.68rem", color: "var(--text-meta)", fontFamily: "var(--font-ui)", fontStyle: "italic" }}>Wildcard {myIdx + 1}</span>
            )}
          </div>
        );
      }
      const resolved = resolveTeam(seed, bracketResults);
      const hasTeam = resolved && resolved.iso;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", minHeight: 26 }}>
          {hasTeam ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://flagcdn.com/w40/${resolved!.iso}.png`} alt={resolved!.code} width={18} height={13} loading="lazy" style={{ borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: "0.72rem", color: "var(--text)" }}>{resolved!.label}</span>
            </>
          ) : (
            <span style={{ fontSize: "0.68rem", color: "var(--text-meta)", fontFamily: "var(--font-ui)", fontStyle: "italic" }}>{seed}</span>
          )}
        </div>
      );
    }

    // ── BracketCard ────────────────────────────────────────────────────────
    function BracketCard({ matchNum }: { matchNum: number }) {
      const row = TOPO_MAP.get(matchNum)!;
      const [, seed1, seed2, , date, timeRaw] = row;
      const state = scores[matchNum] ?? { home: "", away: "" };
      const hasScore = state.home !== "" && state.away !== "";
      return (
        <div style={{
          background: "rgba(255,255,255,0.9)",
          border: "1px solid var(--border-card)",
          borderRadius: 10,
          overflow: "hidden",
          width: CARD_W,
          boxShadow: "0 1px 6px rgba(46,42,40,0.1)",
        }}>
          <div style={{ background: "rgba(215,205,202,0.5)", padding: "3px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-card)" }}>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.58rem", color: "var(--accent)", fontWeight: 700 }}>#{matchNum}</span>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.55rem", color: "var(--text-meta)" }}>{shortDate(date)} · {parseTime(timeRaw)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(46,42,40,0.07)" }}>
            <TeamRow seed={seed1} matchRow={row} wcs={wildcardSlots} />
            {hasScore && <span style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.78rem", color: "var(--text)", paddingRight: 8 }}>{state.home}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <TeamRow seed={seed2} matchRow={row} wcs={wildcardSlots} />
            {hasScore && <span style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.78rem", color: "var(--text)", paddingRight: 8 }}>{state.away}</span>}
          </div>
          <div style={{ padding: "3px 8px 4px", background: "rgba(215,205,202,0.2)", borderTop: "1px solid rgba(46,42,40,0.07)" }}>
            <ScoreInputs matchNumber={matchNum} compact />
          </div>
        </div>
      );
    }

    // ── BracketCol: absolutely-positioned cards + SVG connectors ──────────
    // `nums`       = match numbers top→bottom
    // `connector`  = "right" | "left" | "none"
    //   "right": draw connector lines to the RIGHT toward nextNums
    //   "left":  draw connector lines to the LEFT toward nextNums
    // `nextNums`   = match numbers in the adjacent (closer-to-center) column
    function BracketCol({
      nums,
      connector,
      nextNums,
      label,
    }: {
      nums: number[];
      connector: "right" | "left" | "none";
      nextNums?: number[];
      label: string;
    }) {
      const n = nums.length;
      const stroke = "rgba(107,42,42,0.35)";
      const svgW = ARM + COL_GAP;

      // Build connector paths: pairs (0,1), (2,3)... connect to one nextNums card
      const connectorLines: React.ReactNode[] = [];
      if (nextNums && connector !== "none") {
        for (let i = 0; i < n; i += 2) {
          const topCy    = cardCenterY(i,     n);
          const botCy    = cardCenterY(i + 1, n);
          const midY     = (topCy + botCy) / 2;
          const nextIdx  = i / 2;
          const nextCy   = cardCenterY(nextIdx, nextNums.length);

          if (connector === "right") {
            // Arms go right from card edge, vertical bar joins them, then line to next col
            connectorLines.push(
              <g key={i}>
                <line x1={0}    y1={topCy} x2={ARM} y2={topCy} stroke={stroke} strokeWidth={1.5} />
                <line x1={0}    y1={botCy} x2={ARM} y2={botCy} stroke={stroke} strokeWidth={1.5} />
                <line x1={ARM}  y1={topCy} x2={ARM} y2={botCy} stroke={stroke} strokeWidth={1.5} />
                <line x1={ARM}  y1={midY}  x2={svgW} y2={nextCy} stroke={stroke} strokeWidth={1.5} />
              </g>
            );
          } else {
            // connector === "left": arms go left from card edge
            connectorLines.push(
              <g key={i}>
                <line x1={svgW} y1={topCy} x2={ARM} y2={topCy} stroke={stroke} strokeWidth={1.5} />
                <line x1={svgW} y1={botCy} x2={ARM} y2={botCy} stroke={stroke} strokeWidth={1.5} />
                <line x1={ARM}  y1={topCy} x2={ARM} y2={botCy} stroke={stroke} strokeWidth={1.5} />
                <line x1={ARM}  y1={midY}  x2={0}   y2={nextCy} stroke={stroke} strokeWidth={1.5} />
              </g>
            );
          }
        }
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          {/* Round label */}
          <div style={{
            fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "0.65rem",
            textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--text-meta)", marginBottom: 6, whiteSpace: "nowrap",
          }}>{label}</div>

          {/* Cards + connector row */}
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
            {/* Left connector SVG (for right-side columns that connect leftward) */}
            {connector === "left" && nextNums && (
              <svg width={svgW} height={COL_H} style={{ flexShrink: 0, display: "block" }}>
                {connectorLines}
              </svg>
            )}

            {/* Absolutely-positioned cards column */}
            <div style={{ position: "relative", width: CARD_W, height: COL_H, flexShrink: 0 }}>
              {nums.map((matchNum, i) => {
                const cy = cardCenterY(i, n);
                return (
                  <div
                    key={matchNum}
                    style={{
                      position: "absolute",
                      top: cy - CARD_H / 2,
                      left: 0,
                      width: CARD_W,
                    }}
                  >
                    <BracketCard matchNum={matchNum} />
                  </div>
                );
              })}
            </div>

            {/* Right connector SVG (for left-side columns that connect rightward) */}
            {connector === "right" && nextNums && (
              <svg width={svgW} height={COL_H} style={{ flexShrink: 0, display: "block" }}>
                {connectorLines}
              </svg>
            )}
          </div>
        </div>
      );
    }

    // ── Center column: SF (1 card, vertically centred) ────────────────────
    function SFCol({ matchNum, label, connector, nextCy }: {
      matchNum: number;
      label: string;
      connector: "right" | "left";
      nextCy: number; // y of the Final card centre
    }) {
      const cy = cardCenterY(0, 1); // = COL_H / 2
      const stroke = "rgba(107,42,42,0.35)";
      const svgW = ARM + COL_GAP;

      const connSvg = (
        <svg width={svgW} height={COL_H} style={{ flexShrink: 0, display: "block" }}>
          {connector === "right" ? (
            <line x1={0} y1={cy} x2={svgW} y2={nextCy} stroke={stroke} strokeWidth={1.5} />
          ) : (
            <line x1={svgW} y1={cy} x2={0} y2={nextCy} stroke={stroke} strokeWidth={1.5} />
          )}
        </svg>
      );

      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <div style={{
            fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "0.65rem",
            textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--accent)", marginBottom: 6, whiteSpace: "nowrap",
          }}>{label}</div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
            {connector === "left" && connSvg}
            <div style={{ position: "relative", width: CARD_W, height: COL_H, flexShrink: 0 }}>
              <div style={{ position: "absolute", top: cy - CARD_H / 2, left: 0, width: CARD_W }}>
                <BracketCard matchNum={matchNum} />
              </div>
            </div>
            {connector === "right" && connSvg}
          </div>
        </div>
      );
    }

    // ── Final + 3rd place center piece ────────────────────────────────────
    // Placed between the two SF columns. The Final card sits at COL_H/2,
    // the 3rd place card sits below it.
    function FinalCol() {
      const finalCy = COL_H / 2;
      const thirdCy = finalCy + CARD_H + 24;
      const totalH  = Math.max(COL_H, thirdCy + CARD_H / 2 + 8);
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <div style={{
            fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "0.65rem",
            textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--accent)", marginBottom: 6, whiteSpace: "nowrap",
          }}>Final</div>
          <div style={{ position: "relative", width: CARD_W, height: totalH, flexShrink: 0 }}>
            <div style={{ position: "absolute", top: finalCy - CARD_H / 2, left: 0, width: CARD_W }}>
              <BracketCard matchNum={104} />
            </div>
            <div style={{ position: "absolute", top: thirdCy - CARD_H / 2, left: 0, width: CARD_W }}>
              <div style={{ fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-meta)", textAlign: "center", marginBottom: 4 }}>3rd Place</div>
              <BracketCard matchNum={103} />
            </div>
          </div>
        </div>
      );
    }

    // finalCy is used by SFCol so it knows where to draw its connector line to
    const finalCy = COL_H / 2;

    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(107,42,42,0.07)", border: "1px solid rgba(107,42,42,0.18)", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
          <span style={{ fontSize: "1.4rem", lineHeight: 1, flexShrink: 0 }}>🔱</span>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>Knockout Bracket</strong> — Seeds update live from group standings and wildcard rankings. Enter scores to advance teams.
          </div>
        </div>

        <div style={{ overflowX: "auto", paddingBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 0 }}>

            {/* ── LEFT HALF: R32 → R16 → QF → SF ── */}
            <BracketCol nums={LEFT_R32} connector="right" nextNums={LEFT_R16} label="Round of 32" />
            <BracketCol nums={LEFT_R16} connector="right" nextNums={LEFT_QF}  label="Round of 16" />
            <BracketCol nums={LEFT_QF}  connector="right" nextNums={LEFT_SF}  label="Quarterfinals" />

            {/* Left SF → Final */}
            <SFCol matchNum={101} label="Semifinal" connector="right" nextCy={finalCy} />

            {/* ── CENTER: Final + 3rd ── */}
            <FinalCol />

            {/* Right SF → Final */}
            <SFCol matchNum={102} label="Semifinal" connector="left" nextCy={finalCy} />

            {/* ── RIGHT HALF: QF → R16 → R32 ── */}
            <BracketCol nums={RIGHT_QF}  connector="left" nextNums={RIGHT_R16} label="Quarterfinals" />
            <BracketCol nums={RIGHT_R16} connector="left" nextNums={RIGHT_R32} label="Round of 16" />
            <BracketCol nums={RIGHT_R32} connector="none"                      label="Round of 32" />

          </div>
        </div>
      </div>
    );
  }

  // ── Nav ───────────────────────────────────────────────────────────────────
  const navItems: { id: View; label: string; emoji: string }[] = [
    { id: "today",     label: "Today",     emoji: "📅" },
    { id: "chart",     label: "Chart",     emoji: "📊" },
    { id: "list",      label: "All Games", emoji: "📋" },
    { id: "standings", label: "Standings", emoji: "🏆" },
    { id: "wildcard",  label: "Wildcard",  emoji: "🃏" },
    { id: "bracket",   label: "Bracket",   emoji: "🔱" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: "100vh" }}>
      <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "12px 16px", background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--border-card)", position: "sticky", top: 0, zIndex: 10 }}>
        {navItems.map(({ id, label, emoji }) => (
          <button key={id} onClick={() => setView(id)} style={{ minHeight: 36, padding: "6px 14px", borderRadius: 999, border: "1px solid var(--border-card)", background: view === id ? "var(--accent)" : "rgba(255,255,255,0.6)", color: view === id ? "#fff" : "var(--text)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 5 }}>
            <span>{emoji}</span>{label}
          </button>
        ))}
        {view === "list" && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams, cities…" style={{ marginLeft: "auto", height: 36, padding: "0 12px", borderRadius: 999, border: "1px solid var(--border-card)", background: "rgba(255,255,255,0.8)", fontSize: "0.82rem", fontFamily: "var(--font-ui)", color: "var(--text)", minWidth: 200 }} />
        )}
      </nav>
      <main style={{ flex: 1, padding: "20px 16px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {view === "today"     && <TodayView />}
        {view === "chart"     && <ChartView />}
        {view === "list"      && <ListView />}
        {view === "standings" && <StandingsView />}
        {view === "wildcard"  && <WildcardView />}
        {view === "bracket"   && <BracketView />}
      </main>
    </div>
  );
}
