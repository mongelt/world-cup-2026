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
  (venuesRaw as VenueRaw[]).map((v) => [v.id, v]),
);

// ── Groups  (flat obj { A: [[iso,code,name],...] }) ──────────────────────────
type GroupsJson = Record<string, [string, string, string][]>;
const groupsJson = groupsRaw as unknown as GroupsJson;

export const groups: Record<
  string,
  { iso: string; code: string; name: string }[]
> = Object.fromEntries(
  Object.entries(groupsJson).map(([letter, teams]) => [
    letter,
    teams.map(([iso, code, name]) => ({ iso, code, name })),
  ]),
);

export const teamNames: Record<string, string> = Object.fromEntries(
  Object.values(groups).flatMap((teams) =>
    teams.map(({ code, name }) => [code, name]),
  ),
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
type MatchTuple = [
  number,
  string,
  string,
  string | null,
  string | null,
  string,
  string,
  string,
  string?,
  string?,
];

export const matches: Match[] = (matchesRaw as unknown as MatchTuple[]).map(
  (row) => {
    const [
      matchNumber,
      date,
      timeRaw,
      team1,
      team2,
      stage,
      venueId,
      channel,
      feed1,
      feed2,
    ] = row;
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
  },
);

export const groupStageMatches = matches.filter((m) => m.isGroupStage);
export const chartDays = [...new Set(groupStageMatches.map((m) => m.date))];

// ── Hardcoded final scores for group-stage matches (1–72) ─────────────────
// These matches are finished and locked; scores are served from code, not Edge Config.
export const LOCKED_SCORES: Record<number, { home: string; away: string }> = {
  1: { home: "2", away: "0" },
  2: { home: "2", away: "1" },
  3: { home: "1", away: "1" },
  4: { home: "4", away: "1" },
  5: { home: "1", away: "1" },
  6: { home: "1", away: "1" },
  7: { home: "0", away: "1" },
  8: { home: "2", away: "0" },
  9: { home: "7", away: "1" },
  10: { home: "2", away: "2" },
  11: { home: "1", away: "0" },
  12: { home: "5", away: "1" },
  13: { home: "0", away: "0" },
  14: { home: "1", away: "1" },
  15: { home: "1", away: "1" },
  16: { home: "2", away: "2" },
  17: { home: "3", away: "1" },
  18: { home: "1", away: "4" },
  19: { home: "3", away: "0" },
  20: { home: "3", away: "1" },
  21: { home: "1", away: "1" },
  22: { home: "4", away: "2" },
  23: { home: "1", away: "0" },
  24: { home: "1", away: "3" },
  25: { home: "1", away: "1" },
  26: { home: "4", away: "1" },
  27: { home: "6", away: "0" },
  28: { home: "1", away: "0" },
  29: { home: "2", away: "0" },
  30: { home: "0", away: "1" },
  31: { home: "3", away: "0" },
  32: { home: "0", away: "1" },
  33: { home: "5", away: "1" },
  34: { home: "2", away: "1" },
  35: { home: "0", away: "0" },
  36: { home: "0", away: "4" },
  37: { home: "4", away: "0" },
  38: { home: "0", away: "0" },
  39: { home: "2", away: "0" },
  40: { home: "1", away: "3" },
  41: { home: "2", away: "0" },
  42: { home: "3", away: "0" },
  43: { home: "3", away: "2" },
  44: { home: "1", away: "2" },
  45: { home: "5", away: "0" },
  46: { home: "0", away: "0" },
  47: { home: "0", away: "1" },
  48: { home: "1", away: "0" },
  49: { home: "2", away: "1" },
  50: { home: "3", away: "1" },
  51: { home: "0", away: "3" },
  52: { home: "4", away: "2" },
  53: { home: "0", away: "3" },
  54: { home: "1", away: "0" },
  55: { home: "0", away: "2" },
  56: { home: "2", away: "1" },
  57: { home: "1", away: "1" },
  58: { home: "1", away: "3" },
  59: { home: "3", away: "2" },
  60: { home: "0", away: "0" },
  61: { home: "1", away: "3" },
  62: { home: "4", away: "0" },
  63: { home: "0", away: "0" },
  64: { home: "0", away: "1" },
  65: { home: "1", away: "1" },
  66: { home: "1", away: "5" },
  67: { home: "0", away: "2" },
  68: { home: "2", away: "1" },
  69: { home: "0", away: "0" },
  70: { home: "3", away: "1" },
  71: { home: "3", away: "3" },
  72: { home: "1", away: "3" },
};
