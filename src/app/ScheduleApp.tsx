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

// ── Standing row type ────────────────────────────────────────────────────────
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

function shortDate(key: string) {
  const [m, d] = key.split("/").map(Number);
  return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function weekday(key: string) {
  const [m, d] = key.split("/").map(Number);
  return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
}

function longDate(key: string) {
  const [m, d] = key.split("/").map(Number);
  return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
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
  const ampm = m[3];
  if (ampm === "p" && h !== 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  return h * 60 + min;
}

function nowMinutesET(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.getHours() * 60 + et.getMinutes();
}

function gameStatus(timeRaw: string, matchDate: string): GameStatus {
  const today = todayKeyET();
  if (matchDate !== today) return "upcoming";
  const kickoff = kickoffMinutesET(timeRaw);
  if (kickoff === null) return "upcoming";
  const now = nowMinutesET();
  const elapsed = now - kickoff;
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
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: "0.65rem",
      fontFamily: "var(--font-ui)",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      background: isLive ? "var(--accent)" : "rgba(120,116,113,0.18)",
      color: isLive ? "#fff" : "var(--text-meta)",
      border: isLive ? "none" : "1px solid rgba(120,116,113,0.3)"
    }}>
      {isLive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff6b6b", display: "inline-block" }} />}
      {isLive ? "Live" : "FT"}
    </span>
  );
}

function Flag({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={22}
      height={16}
      loading="lazy"
      style={{
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        objectFit: "cover",
        flexShrink: 0
      }}
    />
  );
}

function HScrollList({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "visible",
        WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        paddingBottom: 4,
        marginInline: 0
      }}
    >
      <div style={{ minWidth: MATCH_CARD_MIN_WIDTH, display: "grid", gap: 10 }}>
        {children}
      </div>
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
    setScores((prev) => ({
      ...prev,
      [matchNumber]: {
        ...(prev[matchNumber] ?? { home: "", away: "" }),
        [side]: clean
      }
    }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchNumber, side, value: clean })
      });
    }, 600);
  }, []);

  const groupLetters = Object.keys(groups);

  // ── Shared standings builder ────────────────────────────────────────────────
  // Returns a sorted standings table for a single group, reading from live scores.
  function buildGroupTable(group: string): StandingRow[] {
    const groupTeams = groups[group] ?? [];
    const table: StandingRow[] = groupTeams.map(({ iso, code, name }) => ({
      iso, code, name, group,
      played: 0, wins: 0, draws: 0, losses: 0,
      gf: 0, ga: 0, gd: 0, points: 0
    }));
    const lookup = Object.fromEntries(table.map((t) => [t.code, t]));
    const relevant = groupStageMatches
      .filter((m) => m.group === group)
      .sort((a, b) => a.matchNumber - b.matchNumber);

    relevant.forEach((match) => {
      const state = scores[match.matchNumber];
      if (!state || state.home === "" || state.away === "") return;
      const hg = Number(state.home);
      const ag = Number(state.away);
      if (Number.isNaN(hg) || Number.isNaN(ag)) return;
      const home = lookup[match.homeCode!];
      const away = lookup[match.awayCode!];
      if (!home || !away) return;
      home.played++; away.played++;
      home.gf += hg; home.ga += ag;
      away.gf += ag; away.ga += hg;
      if (hg > ag) {
        home.wins++; away.losses++; home.points += 3;
      } else if (ag > hg) {
        away.wins++; home.losses++; away.points += 3;
      } else {
        home.draws++; away.draws++; home.points++; away.points++;
      }
    });

    table.forEach((t) => { t.gd = t.gf - t.ga; });
    table.sort((a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name)
    );
    return table;
  }

  function ScoreInputs({ matchNumber, compact = false }: { matchNumber: number; compact?: boolean }) {
    const state = scores[matchNumber] ?? { home: "", away: "" };
    const inputStyle: React.CSSProperties = {
      width: compact ? 40 : 44,
      height: 38,
      borderRadius: 10,
      textAlign: "center",
      fontWeight: 700,
      border: "1px solid rgba(107,42,42,0.22)",
      background: "#fff",
      color: "var(--text)",
      fontSize: "0.9rem"
    };
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: compact ? "flex-end" : "center", marginTop: compact ? 0 : 8 }}>
        <input style={inputStyle} inputMode="numeric" value={state.home}
          aria-label={`Match ${matchNumber} home score`}
          onChange={(e) => setScore(matchNumber, "home", e.target.value)} />
        <span style={{ color: "var(--text-meta)", fontSize: "0.8rem", fontFamily: "var(--font-ui)" }}>–</span>
        <input style={inputStyle} inputMode="numeric" value={state.away}
          aria-label={`Match ${matchNumber} away score`}
          onChange={(e) => setScore(matchNumber, "away", e.target.value)} />
      </div>
    );
  }

  function MatchCard({ match, showDate = false }: { match: Match; showDate?: boolean }) {
    const status = gameStatus(match.timeRaw, match.date);
    const tint = statusTint(status);
    return (
      <article style={{
        display: "grid",
        gridTemplateColumns: "96px minmax(220px,1.2fr) minmax(160px,1fr) minmax(140px,.8fr) minmax(120px,.7fr) auto",
        gap: 10, alignItems: "center", minWidth: MATCH_CARD_MIN_WIDTH,
        background: "rgba(255,255,255,0.74)", border: "1px solid var(--border-card)",
        borderRadius: 16, padding: "12px 14px",
        transition: "background 0.3s ease, box-shadow 0.3s ease", ...tint
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem", color: "var(--accent)", fontWeight: 700 }}>Match #{match.matchNumber}</span>
          <StatusBadge status={status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, color: "var(--text)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Flag src={match.homeFlag} alt={match.homeName} />
            <span style={{ fontSize: "0.9rem" }}>{match.homeDisplay}</span>
          </div>
          <span style={{ color: "var(--text-meta)", fontSize: "0.8rem" }}>v</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.9rem" }}>{match.awayDisplay}</span>
            <Flag src={match.awayFlag} alt={match.awayName} />
          </div>
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          {showDate ? longDate(match.date) : match.timeLabel}
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{match.city} · {match.stadium}</div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.78rem", color: "var(--text-meta)", textTransform: "uppercase" }}>{match.stageLabel}</div>
        <ScoreInputs matchNumber={match.matchNumber} compact />
      </article>
    );
  }

  function TodayView() {
    const today = todayKeyET();
    const todayMatches = matches
      .filter((m) => m.date === today)
      .sort((a, b) => (kickoffMinutesET(a.timeRaw) ?? 0) - (kickoffMinutesET(b.timeRaw) ?? 0));

    const nextDay = todayMatches.length === 0
      ? [...new Set(matches.map((m) => m.date))]
          .sort((a, b) => {
            const [am, ad] = a.split("/").map(Number);
            const [bm, bd] = b.split("/").map(Number);
            return am !== bm ? am - bm : ad - bd;
          })
          .find((d) => {
            const [dm, dd] = d.split("/").map(Number);
            const [tm, td] = today.split("/").map(Number);
            return dm > tm || (dm === tm && dd > td);
          })
      : null;

    const etNow = new Date().toLocaleTimeString("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true
    });

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-ui)" }}>{longDate(today)}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-meta)", fontFamily: "var(--font-ui)", marginTop: 2 }}>Current time: {etNow} ET</div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: "0.72rem", fontFamily: "var(--font-ui)", color: "var(--text-meta)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(107,42,42,0.13)", border: "1px solid rgba(107,42,42,0.35)", display: "inline-block" }} />Live
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(200,196,193,0.55)", border: "1px solid rgba(120,116,113,0.3)", display: "inline-block" }} />Finished
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(255,255,255,0.74)", border: "1px solid var(--border-card)", display: "inline-block" }} />Upcoming
            </span>
          </div>
        </div>
        {todayMatches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-meta)", fontFamily: "var(--font-ui)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⚽</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No matches today</div>
            {nextDay && <div style={{ fontSize: "0.88rem" }}>Next match day: <strong>{longDate(nextDay)}</strong></div>}
          </div>
        ) : (
          <HScrollList>
            {todayMatches.map((match) => <MatchCard key={match.matchNumber} match={match} />)}
          </HScrollList>
        )}
      </div>
    );
  }

  function ChartView() {
    const colCount = chartDays.length;
    const COL_W = 164;
    return (
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `130px repeat(${colCount}, minmax(${COL_W}px, 1fr))`,
          minWidth: 130 + colCount * COL_W,
          border: "1px solid var(--border-card)",
          borderRadius: 16, overflow: "hidden",
          background: "rgba(255,255,255,0.22)"
        }}>
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
                      const tint = statusTint(status);
                      return (
                        <div key={match.matchNumber} style={{ background: "rgba(255,255,255,0.82)", border: "1px solid var(--border-card)", borderRadius: 14, padding: "8px 10px", marginBottom: 6, transition: "background 0.3s ease, box-shadow 0.3s ease", ...tint }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontFamily: "var(--font-ui)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-meta)" }}>
                            <span>#{match.matchNumber}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <StatusBadge status={status} />
                              <span>{match.timeLabel}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                              <Flag src={match.homeFlag} alt={match.homeName} />
                              <span style={{ fontWeight: 800, color: "var(--text)" }}>{match.homeCode}</span>
                            </div>
                            <span style={{ color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: "0.68rem", flexShrink: 0, padding: "0 2px" }}>v</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, justifyContent: "flex-end" }}>
                              <span style={{ fontWeight: 800, color: "var(--text)" }}>{match.awayCode}</span>
                              <Flag src={match.awayFlag} alt={match.awayName} />
                            </div>
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
    const filtered = matches.filter((m) => {
      if (!q) return true;
      return [m.matchNumber, m.homeDisplay, m.awayDisplay, m.homeName, m.awayName, m.stageLabel, m.city, m.stadium, m.venueId, m.date].join(" ").toLowerCase().includes(q);
    });
    return (
      <HScrollList>
        {filtered.map((match) => <MatchCard key={match.matchNumber} match={match} showDate />)}
      </HScrollList>
    );
  }

  function StandingsView() {
    const table = buildGroupTable(activeGroup);
    const relevant = groupStageMatches.filter((m) => m.group === activeGroup).sort((a, b) => a.matchNumber - b.matchNumber);

    return (
      <div className="wc-standings-layout" style={{ display: "grid", gridTemplateColumns: "minmax(240px,280px) 1fr", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 8 }}>
          {groupLetters.map((g) => (
            <button key={g} onClick={() => setActiveGroup(g)} style={{
              minHeight: 44, padding: "10px 16px", borderRadius: 999,
              border: "1px solid var(--border-card)",
              background: g === activeGroup ? "var(--accent)" : "rgba(255,255,255,0.6)",
              color: g === activeGroup ? "#fff" : "var(--text)",
              cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.85rem"
            }}>Group {g}</button>
          ))}
        </aside>
        <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-card)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text)" }}>Group {activeGroup} Standings</h3>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-meta)", textTransform: "uppercase" }}>Win 3pts · Draw 1pt · Loss 0pts</span>
          </div>
          <table>
            <thead>
              <tr>
                {["Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"].map((h) => (
                  <th key={h} style={{ padding: "10px 8px", fontSize: "0.72rem", fontFamily: "var(--font-ui)", textTransform: "uppercase", color: "var(--text-meta)", background: "rgba(215,205,202,0.55)", textAlign: h === "Team" ? "left" : "center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((team) => (
                <tr key={team.code} style={{ borderBottom: "1px solid rgba(46,42,40,0.1)" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://flagcdn.com/w40/${team.iso}.png`} alt={team.name} width={22} height={16} loading="lazy" style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover" }} />
                      <span>{team.code} · {team.name}</span>
                    </div>
                  </td>
                  {[team.played, team.wins, team.draws, team.losses, team.gf, team.ga, team.gd].map((v, i) => (
                    <td key={i} style={{ textAlign: "center", padding: "10px 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{v}</td>
                  ))}
                  <td style={{ textAlign: "center", padding: "10px 6px", fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>{team.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "14px 16px", display: "grid", gap: 10, borderTop: "1px solid var(--border-card)" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-meta)", letterSpacing: "0.05em", marginBottom: 4 }}>Enter scores</div>
            {relevant.map((match) => (
              <div key={match.matchNumber} className="wc-standings-card-row" style={{ display: "grid", gridTemplateColumns: "64px 1fr 104px 1fr", gap: 8, alignItems: "center", background: "rgba(255,255,255,0.74)", border: "1px solid var(--border-card)", borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--accent)" }}>#{match.matchNumber}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.85rem" }}>
                  <Flag src={match.homeFlag} alt={match.homeName} />
                  {match.homeCode}
                </div>
                <ScoreInputs matchNumber={match.matchNumber} compact />
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.85rem", justifyContent: "flex-end" }}>
                  {match.awayCode}
                  <Flag src={match.awayFlag} alt={match.awayName} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Wildcard View ────────────────────────────────────────────────────────────
  // Collects the 3rd-place team from every group, ranks them, marks top 8 as
  // advancing. Tiebreak: Pts → GD → GF → code (alphabetical).
  function WildcardView() {
    const thirdPlaceTeams: StandingRow[] = groupLetters
      .map((g) => buildGroupTable(g)[2])
      .filter(Boolean) as StandingRow[];

    thirdPlaceTeams.sort((a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.code.localeCompare(b.code)
    );

    const advanceCount = 8;
    const totalGroups = groupLetters.length; // 12
    const allGroupsHaveThird = thirdPlaceTeams.length === totalGroups;

    // How many third-place teams have played at least one match
    const playedCount = thirdPlaceTeams.filter((t) => t.played > 0).length;

    const thHeaders = ["#", "Team", "Group", "P", "W", "D", "L", "GF", "GA", "GD", "Pts", "Status"];

    return (
      <div>
        {/* Info banner */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          background: "rgba(107,42,42,0.07)",
          border: "1px solid rgba(107,42,42,0.18)",
          borderRadius: 14, padding: "12px 16px", marginBottom: 20
        }}>
          <span style={{ fontSize: "1.4rem", lineHeight: 1, flexShrink: 0 }}>🃏</span>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>8 wildcards advance</strong> from the 12 third-place finishers.
            Rankings update live as scores are entered.
            {!allGroupsHaveThird && playedCount < totalGroups && (
              <span style={{ color: "var(--text-meta)" }}> · {totalGroups - thirdPlaceTeams.length > 0 ? `${totalGroups - thirdPlaceTeams.length} groups not yet started` : `${totalGroups - playedCount} groups have no scores yet`}</span>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden" }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                {thHeaders.map((h) => (
                  <th key={h} style={{
                    padding: "10px 8px",
                    fontSize: "0.72rem",
                    fontFamily: "var(--font-ui)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--text-meta)",
                    background: "rgba(215,205,202,0.55)",
                    textAlign: (h === "Team" || h === "Status") ? "left" : "center",
                    whiteSpace: "nowrap"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {thirdPlaceTeams.length === 0 ? (
                <tr>
                  <td colSpan={thHeaders.length} style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-meta)", fontFamily: "var(--font-ui)", fontSize: "0.9rem" }}>
                    ⚽ Waiting for group stage scores — enter results in Standings or Chart view.
                  </td>
                </tr>
              ) : (
                thirdPlaceTeams.map((team, idx) => {
                  const advances = idx < advanceCount;
                  const cutlineAbove = idx === advanceCount && thirdPlaceTeams.length > advanceCount;
                  return (
                    <>
                      {cutlineAbove && (
                        <tr key="cutline">
                          <td colSpan={thHeaders.length} style={{
                            padding: "0",
                            background: "rgba(107,42,42,0.18)",
                            height: 2,
                            borderTop: "2px dashed rgba(107,42,42,0.4)"
                          }} />
                        </tr>
                      )}
                      <tr key={team.code} style={{
                        borderBottom: "1px solid rgba(46,42,40,0.1)",
                        background: advances
                          ? "rgba(107,42,42,0.04)"
                          : idx >= advanceCount ? "rgba(200,196,193,0.22)" : "transparent",
                        opacity: advances ? 1 : 0.72
                      }}>
                        {/* Rank */}
                        <td style={{ textAlign: "center", padding: "10px 8px", fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "0.95rem", color: advances ? "var(--accent)" : "var(--text-meta)" }}>
                          {idx + 1}
                        </td>
                        {/* Team */}
                        <td style={{ padding: "10px 8px", minWidth: 180 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`https://flagcdn.com/w40/${team.iso}.png`}
                              alt={team.name} width={22} height={16} loading="lazy"
                              style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover", flexShrink: 0 }}
                            />
                            <span>{team.code} · {team.name}</span>
                          </div>
                        </td>
                        {/* Group */}
                        <td style={{ textAlign: "center", padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
                          {team.group}
                        </td>
                        {/* Stats */}
                        {[team.played, team.wins, team.draws, team.losses, team.gf, team.ga, team.gd].map((v, i) => (
                          <td key={i} style={{ textAlign: "center", padding: "10px 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{v}</td>
                        ))}
                        {/* Points */}
                        <td style={{ textAlign: "center", padding: "10px 6px", fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>{team.points}</td>
                        {/* Status */}
                        <td style={{ padding: "10px 10px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 10px", borderRadius: 999,
                            fontFamily: "var(--font-ui)", fontSize: "0.68rem",
                            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                            background: advances ? "rgba(107,42,42,0.12)" : "rgba(180,170,165,0.28)",
                            color: advances ? "var(--accent)" : "var(--text-meta)",
                            border: `1px solid ${advances ? "rgba(107,42,42,0.3)" : "rgba(120,116,113,0.2)"}`
                          }}>
                            {advances ? "✓ Advance" : "Eliminated"}
                          </span>
                        </td>
                      </tr>
                    </>
                  );
                })
              )}
            </tbody>
          </table>
          {thirdPlaceTeams.length > 0 && thirdPlaceTeams.length < totalGroups && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-card)", fontFamily: "var(--font-ui)", fontSize: "0.78rem", color: "var(--text-meta)" }}>
              Showing {thirdPlaceTeams.length} of {totalGroups} groups — {totalGroups - thirdPlaceTeams.length} group{totalGroups - thirdPlaceTeams.length !== 1 ? "s" : ""} not yet started.
            </div>
          )}
        </div>
      </div>
    );
  }

  const pill = (label: string, subtle = false) => (
    <span style={{
      minHeight: 40, display: "inline-flex", alignItems: "center",
      padding: "8px 14px", borderRadius: 999,
      background: subtle ? "rgba(107,42,42,0.09)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${subtle ? "rgba(107,42,42,0.2)" : "rgba(255,255,255,0.12)"}`,
      color: subtle ? "var(--accent)" : "#ccc",
      fontFamily: "var(--font-ui)", fontSize: "0.78rem",
      textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0
    }}>{label}</span>
  );

  const viewBtn = (v: View, label: string) => (
    <button onClick={() => setView(v)} style={{
      minHeight: 40, padding: "9px 16px", borderRadius: 999,
      border: `1px solid ${view === v ? "var(--accent)" : "rgba(255,255,255,0.16)"}`,
      background: view === v ? "var(--accent)" : "transparent",
      color: view === v ? "#fff" : "#aaa",
      cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.8rem",
      transition: "all 0.15s ease"
    }}>{label}</button>
  );

  const panelStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid rgba(107,42,42,0.18)",
    borderTop: "6px solid var(--accent)",
    borderBottom: "3px solid var(--accent)",
    borderRadius: 22, overflow: "hidden",
    boxShadow: "var(--shadow)"
  };

  const headStyle: React.CSSProperties = {
    padding: "20px 22px 14px",
    borderBottom: "1px solid rgba(107,42,42,0.12)"
  };

  return (
    <div className="wc-app" style={{ maxWidth: 1700, margin: "0 auto", padding: "20px 16px" }}>
      <header className="wc-topbar" style={{
        position: "sticky", top: 0, zIndex: 10, marginBottom: 20,
        background: "rgba(11,10,10,0.92)",
        backdropFilter: "saturate(180%) blur(20px)",
        border: "1px solid rgba(252,84,84,0.2)",
        borderTop: "8px solid var(--accent)",
        borderRadius: 22, padding: "16px 18px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.14)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#e8e8e8", fontSize: "clamp(1.7rem,2.3vw,2.7rem)", fontFamily: "var(--font-ui)", fontWeight: 700, lineHeight: 1 }}>World Cup 2026</h1>
            <div style={{ marginTop: 6, color: "#888", fontFamily: "var(--font-ui)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>104 matches · 12 groups · EST kickoff times</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {viewBtn("today", "Today")}
            {viewBtn("chart", "Chart")}
            {viewBtn("list", "All Matches")}
            {viewBtn("standings", "Standings")}
            {viewBtn("wildcard", "Wildcard")}
            {viewBtn("bracket", "Bracket")}
          </div>
          {pill("Scores sync across devices")}
        </div>
      </header>

      {view === "today" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Today's Matches</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>All kickoff times in ET. Games tinted when live (≤120 min elapsed) or finished (&gt;120 min).</p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}><TodayView /></div>
        </section>
      )}

      {view === "chart" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Group Stage Chart</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Groups A–L as rows, match days as columns. Score inputs sync to Edge Config so everyone sees the same scores.</p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}><ChartView /></div>
        </section>
      )}

      {view === "list" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>All Matches</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Group stage through the final. Search by team, city, stage, or match number.</p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team, city, stadium, group, stage, match #…"
                style={{ flex: "1 1 340px", minHeight: 44, borderRadius: 12, padding: "0 14px", border: "1px solid rgba(107,42,42,0.22)", background: "#fff", color: "var(--text)", maxWidth: 440 }}
              />
              {pill(`${matches.filter((m) => { const q = search.trim().toLowerCase(); return !q || [m.matchNumber, m.homeDisplay, m.awayDisplay, m.stageLabel, m.city, m.stadium].join(" ").toLowerCase().includes(q); }).length} matches`, true)}
            </div>
            <ListView />
          </div>
        </section>
      )}

      {view === "standings" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Group Standings</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Enter scores in the chart or list view and standings update instantly here.</p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}><StandingsView /></div>
        </section>
      )}

      {view === "wildcard" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Wildcard — Third-Place Rankings</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>The 8 best third-place finishers across 12 groups advance to the Round of 32.</p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}><WildcardView /></div>
        </section>
      )}

      {view === "bracket" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Playoff Bracket</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>Round of 32 through the Final. Winners auto-advance as scores are entered.</p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "64px 32px", gap: 16 }}>
              <span style={{ fontSize: "3rem" }}>🏆</span>
              <h3 style={{ margin: 0, fontSize: "1.3rem", color: "var(--text)", fontFamily: "var(--font-ui)", fontWeight: 700 }}>Knockout bracket</h3>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.92rem", maxWidth: "48ch" }}>Full 32-team bracket from Round of 32 to the Final. Seeding pulls from group standings and the wildcard third-place rankings.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
