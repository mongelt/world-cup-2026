import matchesRaw from "./matches.json";
import groupsRaw from "./groups.json";
import venuesRaw from "./venues.json";
import isoRaw from "./iso.json";

// ── ISO map ─────────────────────────────────────────────────────────────────
const isoMap: Record<string, string> = isoRaw as Record<string, string>;
export const flagUrl = (code: string) =>
  `https://flagcdn.com/w40/${isoMap[code] ?? "xx"}.png`;

// ── Venues  (flat array [{id,co,city,stad}]) ─────────────────────────────────
type VenueRaw = { id: string; co: string; city: string; stad: string };
export const venues: Record<string, VenueRaw> = Object.fromEntries(
  (venuesRaw as VenueRaw[]).map((v) => [v.id, v])
);

// ── Groups  (flat obj { A: [[iso,code,name],...] }) ──────────────────────────
type GroupsJson = Record<string, [string, string, string][]>;
const groupsJson = groupsRaw as unknown as GroupsJson;

export const groups: Record<string, { iso: string; code: string; name: string }[]> =
  Object.fromEntries(
    Object.entries(groupsJson).map(([letter, teams]) => [
      letter,
      teams.map(([iso, code, name]) => ({ iso, code, name })),
    ])
  );

export const teamNames: Record<string, string> = Object.fromEntries(
  Object.values(groups).flatMap((teams) => teams.map(({ code, name }) => [code, name]))
);

// ── Stage labels ─────────────────────────────────────────────────────────────
const stageLabels: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarterfinal",
  SF: "Semifinal",
  "3RD": "Third Place",
  FIN: "Final",
};

function parseTime(raw: string): string {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?([ap])$/);
  if (!m) return raw;
  return `${m[1]}:${m[2] ?? "00"} ${m[3] === "a" ? "AM" : "PM"} ET`;
}

// ── Match interface ───────────────────────────────────────────────────────────
export interface Match {
  matchNumber: number;
  date: string;
  timeRaw: string;
  timeLabel: string;
  homeCode: string | null;
  awayCode: string | null;
  homeDisplay: string;
  awayDisplay: string;
  homeName: string;
  awayName: string;
  homeFlag: string | null;
  awayFlag: string | null;
  group: string | null;
  isGroupStage: boolean;
  stageLabel: string;
  city: string;
  stadium: string;
  venueId: string;
  channel: string;
  feedA: string | null;
  feedB: string | null;
}

// matches.json: flat array of tuples
// [matchNum, date, time, team1|null, team2|null, group_or_stage, venueId, channel, feed1?, feed2?]
type MatchTuple = [number, string, string, string | null, string | null, string, string, string, string?, string?];

export const matches: Match[] = (matchesRaw as unknown as MatchTuple[]).map((row) => {
  const [matchNumber, date, timeRaw, team1, team2, stage, venueId, channel, feed1, feed2] = row;
  const venue = venues[venueId] ?? { city: "TBD", stad: "TBD", co: "us" };
  const isGroup = /^[A-L]$/.test(stage);
  const hCode = team1 ?? null;
  const aCode = team2 ?? null;
  return {
    matchNumber,
    date,
    timeRaw,
    timeLabel: parseTime(timeRaw),
    homeCode: hCode,
    awayCode: aCode,
    homeDisplay: hCode ?? feed1 ?? "TBD",
    awayDisplay: aCode ?? feed2 ?? "TBD",
    homeName: hCode ? (teamNames[hCode] ?? hCode) : (feed1 ?? "TBD"),
    awayName: aCode ? (teamNames[aCode] ?? aCode) : (feed2 ?? "TBD"),
    homeFlag: hCode ? flagUrl(hCode) : null,
    awayFlag: aCode ? flagUrl(aCode) : null,
    group: isGroup ? stage : null,
    isGroupStage: isGroup,
    stageLabel: isGroup ? `Group ${stage}` : (stageLabels[stage] ?? stage),
    city: venue.city,
    stadium: venue.stad,
    venueId,
    channel,
    feedA: feed1 ?? null,
    feedB: feed2 ?? null,
  };
});

export const groupStageMatches = matches.filter((m) => m.isGroupStage);
export const chartDays = [...new Set(groupStageMatches.map((m) => m.date))];
