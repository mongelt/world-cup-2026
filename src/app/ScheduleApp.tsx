"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Match } from "@/lib/schedule";

type ScoreState = Record<number, { home: string; away: string }>;
type GroupData = Record<string, Array<[string, string, string]>>;
type View = "chart" | "list" | "standings";

interface Props {
  matches: Match[];
  groups: GroupData;
  chartDays: string[];
  groupStageMatches: Match[];
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

export default function ScheduleApp({ matches, groups, chartDays, groupStageMatches }: Props) {
  const [view, setView] = useState<View>("chart");
  const [scores, setScores] = useState<ScoreState>({});
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("A");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function ScoreInputs({ matchNumber, compact = false }: { matchNumber: number; compact?: boolean }) {
    const state = scores[matchNumber] ?? { home: "", away: "" };
    const inputStyle: React.CSSProperties = {
      width: compact ? 40 : 48,
      height: 40,
      borderRadius: 10,
      textAlign: "center",
      fontWeight: 700,
      border: "1px solid rgba(107,42,42,0.22)",
      background: "#fff",
      color: "var(--text)",
      fontSize: "0.9rem"
    };

    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          justifyContent: compact ? "flex-end" : "center",
          marginTop: compact ? 0 : 8
        }}
      >
        <input
          style={inputStyle}
          inputMode="numeric"
          value={state.home}
          aria-label={`Match ${matchNumber} home score`}
          onChange={(e) => setScore(matchNumber, "home", e.target.value)}
        />
        <span style={{ color: "var(--text-meta)", fontSize: "0.8rem", fontFamily: "var(--font-ui)" }}>–</span>
        <input
          style={inputStyle}
          inputMode="numeric"
          value={state.away}
          aria-label={`Match ${matchNumber} away score`}
          onChange={(e) => setScore(matchNumber, "away", e.target.value)}
        />
      </div>
    );
  }

  function ChartView() {
    const colCount = chartDays.length;
    return (
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `130px repeat(${colCount}, minmax(136px, 1fr))`,
            minWidth: 130 + colCount * 136,
            border: "1px solid var(--border-card)",
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(255,255,255,0.22)"
          }}
        >
          <div
            style={{
              background: "#1a1618",
              color: "#e0e0e0",
              padding: "12px 10px",
              fontFamily: "var(--font-ui)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em"
            }}
          >
            Group / Day
          </div>
          {chartDays.map((day) => (
            <div
              key={day}
              style={{
                background: "#d8d0cc",
                padding: "10px 8px",
                borderLeft: "1px solid rgba(46,42,40,0.14)",
                borderBottom: "1px solid rgba(46,42,40,0.14)"
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: "var(--accent)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.75rem",
                  textTransform: "uppercase"
                }}
              >
                {shortDate(day)}
              </strong>
              <span style={{ display: "block", marginTop: 3, color: "var(--text-meta)", fontSize: "0.75rem" }}>
                {weekday(day)}
              </span>
            </div>
          ))}
          {groupLetters.map((group) => (
            <>
              <div
                key={`g-${group}`}
                style={{
                  background: "#d5cbc7",
                  padding: "12px 10px",
                  fontFamily: "var(--font-ui)",
                  fontWeight: 700,
                  fontSize: "1rem",
                  textTransform: "uppercase",
                  color: "var(--text)",
                  borderTop: "1px solid rgba(46,42,40,0.14)",
                  position: "sticky",
                  left: 0,
                  zIndex: 2
                }}
              >
                Group {group}
              </div>
              {chartDays.map((day) => {
                const dayMatches = groupStageMatches.filter((m) => m.group === group && m.date === day);
                return (
                  <div
                    key={`${group}-${day}`}
                    style={{
                      background: "rgba(255,255,255,0.32)",
                      padding: 8,
                      borderLeft: "1px solid rgba(46,42,40,0.14)",
                      borderTop: "1px solid rgba(46,42,40,0.14)",
                      minHeight: 90
                    }}
                  >
                    {dayMatches.map((match) => (
                      <div
                        key={match.matchNumber}
                        style={{
                          background: "rgba(255,255,255,0.82)",
                          border: "1px solid var(--border-card)",
                          borderRadius: 14,
                          padding: "8px 10px",
                          marginBottom: 6
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 6,
                            fontFamily: "var(--font-ui)",
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--text-meta)"
                          }}
                        >
                          <span>#{match.matchNumber}</span>
                          <span>{match.timeLabel}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "center", fontSize: "0.72rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <Flag src={match.homeFlag} alt={match.homeName} />
                            <span style={{ fontWeight: 800, color: "var(--text)" }}>{match.homeCode}</span>
                          </div>
                          <span style={{ color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: "0.68rem" }}>v</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "var(--text)" }}>{match.awayCode}</span>
                            <Flag src={match.awayFlag} alt={match.awayName} />
                          </div>
                        </div>
                        <ScoreInputs matchNumber={match.matchNumber} />
                      </div>
                    ))}
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
      return [
        m.matchNumber,
        m.homeDisplay,
        m.awayDisplay,
        m.homeName,
        m.awayName,
        m.stageLabel,
        m.city,
        m.stadium,
        m.venueId,
        m.date
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return (
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((match) => (
          <article
            key={match.matchNumber}
            className="wc-list-item"
            style={{
              display: "grid",
              gridTemplateColumns: "96px minmax(240px,1.2fr) minmax(180px,1fr) minmax(150px,.8fr) minmax(130px,.7fr) 110px",
              gap: 10,
              alignItems: "center",
              background: "rgba(255,255,255,0.74)",
              border: "1px solid var(--border-card)",
              borderRadius: 16,
              padding: "12px 14px"
            }}
          >
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem", color: "var(--accent)", fontWeight: 700 }}>
              Match #{match.matchNumber}
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
            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{longDate(match.date)} · {match.timeLabel}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{match.city} · {match.stadium}</div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.78rem", color: "var(--text-meta)", textTransform: "uppercase" }}>
              {match.stageLabel}
            </div>
            <ScoreInputs matchNumber={match.matchNumber} compact />
          </article>
        ))}
      </div>
    );
  }

  function StandingsView() {
    const groupTeams = groups[activeGroup] ?? [];
    const table = groupTeams.map(([iso, code, name]) => ({
      iso,
      code,
      name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0
    }));
    const lookup = Object.fromEntries(table.map((t) => [t.code, t]));
    const relevant = groupStageMatches.filter((m) => m.group === activeGroup).sort((a, b) => a.matchNumber - b.matchNumber);

    relevant.forEach((match) => {
      const state = scores[match.matchNumber];
      if (!state || state.home === "" || state.away === "") return;
      const hg = Number(state.home);
      const ag = Number(state.away);
      if (Number.isNaN(hg) || Number.isNaN(ag)) return;
      const home = lookup[match.homeCode!];
      const away = lookup[match.awayCode!];
      if (!home || !away) return;
      home.played += 1;
      away.played += 1;
      home.gf += hg;
      home.ga += ag;
      away.gf += ag;
      away.ga += hg;
      if (hg > ag) {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
      } else if (ag > hg) {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    });

    table.forEach((t) => {
      t.gd = t.gf - t.ga;
    });
    table.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));

    return (
      <div className="wc-standings-layout" style={{ display: "grid", gridTemplateColumns: "minmax(240px,280px) 1fr", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 8 }}>
          {groupLetters.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              style={{
                minHeight: 44,
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid var(--border-card)",
                background: g === activeGroup ? "var(--accent)" : "rgba(255,255,255,0.6)",
                color: g === activeGroup ? "#fff" : "var(--text)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontSize: "0.85rem"
              }}
            >
              Group {g}
            </button>
          ))}
        </aside>
        <div style={{ background: "rgba(255,255,255,0.58)", border: "1px solid var(--border-card)", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-card)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text)" }}>Group {activeGroup} Standings</h3>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-meta)", textTransform: "uppercase" }}>
              Win 3pts · Draw 1pt · Loss 0pts
            </span>
          </div>
          <table>
            <thead>
              <tr>
                {["Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 8px",
                      fontSize: "0.72rem",
                      fontFamily: "var(--font-ui)",
                      textTransform: "uppercase",
                      color: "var(--text-meta)",
                      background: "rgba(215,205,202,0.55)",
                      textAlign: h === "Team" ? "left" : "center"
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((team) => (
                <tr key={team.code} style={{ borderBottom: "1px solid rgba(46,42,40,0.1)" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://flagcdn.com/w40/${team.iso}.png`}
                        alt={team.name}
                        width={22}
                        height={16}
                        loading="lazy"
                        style={{ borderRadius: 3, border: "1px solid rgba(0,0,0,0.08)", objectFit: "cover" }}
                      />
                      <span>{team.code} · {team.name}</span>
                    </div>
                  </td>
                  {[team.played, team.wins, team.draws, team.losses, team.gf, team.ga, team.gd].map((v, i) => (
                    <td key={i} style={{ textAlign: "center", padding: "10px 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {v}
                    </td>
                  ))}
                  <td style={{ textAlign: "center", padding: "10px 6px", fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>
                    {team.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "14px 16px", display: "grid", gap: 10, borderTop: "1px solid var(--border-card)" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-meta)", letterSpacing: "0.05em", marginBottom: 4 }}>
              Enter scores
            </div>
            {relevant.map((match) => (
              <div
                key={match.matchNumber}
                className="wc-standings-card-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr 104px 1fr",
                  gap: 8,
                  alignItems: "center",
                  background: "rgba(255,255,255,0.74)",
                  border: "1px solid var(--border-card)",
                  borderRadius: 14,
                  padding: "10px 12px"
                }}
              >
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

  const pill = (label: string, subtle = false) => (
    <span
      style={{
        minHeight: 40,
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 14px",
        borderRadius: 999,
        background: subtle ? "rgba(107,42,42,0.09)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${subtle ? "rgba(107,42,42,0.2)" : "rgba(255,255,255,0.12)"}`,
        color: subtle ? "var(--accent)" : "#ccc",
        fontFamily: "var(--font-ui)",
        fontSize: "0.78rem",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        flexShrink: 0
      }}
    >
      {label}
    </span>
  );

  const viewBtn = (v: View, label: string) => (
    <button
      onClick={() => setView(v)}
      style={{
        minHeight: 40,
        padding: "9px 16px",
        borderRadius: 999,
        border: `1px solid ${view === v ? "var(--accent)" : "rgba(255,255,255,0.16)"}`,
        background: view === v ? "var(--accent)" : "transparent",
        color: view === v ? "#fff" : "#aaa",
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontSize: "0.8rem",
        transition: "all 0.15s ease"
      }}
    >
      {label}
    </button>
  );

  const panelStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid rgba(107,42,42,0.18)",
    borderTop: "6px solid var(--accent)",
    borderBottom: "3px solid var(--accent)",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "var(--shadow)"
  };

  const headStyle: React.CSSProperties = {
    padding: "20px 22px 14px",
    borderBottom: "1px solid rgba(107,42,42,0.12)"
  };

  return (
    <div className="wc-app" style={{ maxWidth: 1700, margin: "0 auto", padding: "20px 16px" }}>
      <header
        className="wc-topbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          marginBottom: 20,
          background: "rgba(11,10,10,0.92)",
          backdropFilter: "saturate(180%) blur(20px)",
          border: "1px solid rgba(252,84,84,0.2)",
          borderTop: "8px solid var(--accent)",
          borderRadius: 22,
          padding: "16px 18px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.14)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#e8e8e8", fontSize: "clamp(1.7rem,2.3vw,2.7rem)", fontFamily: "var(--font-ui)", fontWeight: 700, lineHeight: 1 }}>
              World Cup 2026
            </h1>
            <div style={{ marginTop: 6, color: "#888", fontFamily: "var(--font-ui)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              104 matches · 12 groups · EST kickoff times
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {viewBtn("chart", "Chart")}
            {viewBtn("list", "All Matches")}
            {viewBtn("standings", "Standings")}
          </div>
          {pill("Scores sync across devices")}
        </div>
      </header>

      {view === "chart" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Group Stage Chart</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>
              Groups A–L as rows, match days as columns. Score inputs sync to Vercel KV so everyone sees the same scores.
            </p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}>
            <ChartView />
          </div>
        </section>
      )}

      {view === "list" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>All Matches</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>
              Group stage through the final. Search by team, city, stage, or match number.
            </p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team, city, stadium, group, stage, match #…"
                style={{
                  flex: "1 1 340px",
                  minHeight: 44,
                  borderRadius: 12,
                  padding: "0 14px",
                  border: "1px solid rgba(107,42,42,0.22)",
                  background: "#fff",
                  color: "var(--text)",
                  maxWidth: 440
                }}
              />
              {pill(
                `${matches.filter((m) => {
                  const q = search.trim().toLowerCase();
                  return !q || [m.matchNumber, m.homeDisplay, m.awayDisplay, m.stageLabel, m.city, m.stadium].join(" ").toLowerCase().includes(q);
                }).length} matches`,
                true
              )}
            </div>
            <ListView />
          </div>
        </section>
      )}

      {view === "standings" && (
        <section className="wc-panel" style={panelStyle}>
          <div style={headStyle}>
            <h2 style={{ margin: 0, color: "var(--text)", fontSize: "clamp(1.2rem,1.6vw,1.8rem)" }}>Group Standings</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", maxWidth: "80ch", fontSize: "0.88rem" }}>
              Enter scores in the chart or list view and standings update instantly here.
            </p>
          </div>
          <div style={{ padding: "16px 18px 22px" }}>
            <StandingsView />
          </div>
        </section>
      )}
    </div>
  );
}
