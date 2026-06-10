import matchesData from "./matches.json";
import groupsData from "./groups.json";
import venuesData from "./venues.json";
import rawIso from "./iso.json";

const isoMap: Record<string, string> = rawIso as Record<string, string>;

// ── Venues ──────────────────────────────────────────────────────────────────
type VenueRaw = { id: string; city: string; stadium: string; country_code: string };
export const venues: Record<string, VenueRaw> = Object.fromEntries(
  (venuesData.venues as VenueRaw[]).map((v) => [v.id, v])
);

// ── Groups ───────────────────────────────────────────────────────────────────
type GroupTeam = { iso_flag: string; code: string; name: string };
type GroupsShape = { groups: Record<string, GroupTeam[]>; fixtures: Record<string, unknown[]> };
const rawGroups = groupsData as unknown as GroupsShape;
export const groups = rawGroups.groups;

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

export const flagUrl = (code: string) =>
  `https://flagcdn.com/w40/${isoMap[code] ?? "xx"}.png`;

// ── Matches ───────────────────────────────────────────────────────────────────
type MatchRaw = {
  match_number: number;
  date: string;
  time_et: string;
  team1_code: string | null;
  team2_code: string | null;
  group_or_stage: string;
  venue_id: string;
  channel: string;
  feed1?: string | null;
  feed2?: string | null;
};

export const matches: Match[] = (matchesData.matches as MatchRaw[]).map((row) => {
  const {
    match_number,
    date,
    time_et,
    team1_code,
    team2_code,
    group_or_stage,
    venue_id,
    channel,
    feed1 = null,
    feed2 = null,
  } = row;
  const venue = venues[venue_id] ?? { city: "TBD", stadium: "TBD", country_code: "us" };
  const isGroup = /^[A-L]$/.test(group_or_stage);
  const hCode = team1_code || null;
  const aCode = team2_code || null;
  return {
    matchNumber: match_number,
    date,
    timeRaw: time_et,
    timeLabel: parseTime(time_et),
    homeCode: hCode,
    awayCode: aCode,
    homeDisplay: hCode ?? feed1 ?? "TBD",
    awayDisplay: aCode ?? feed2 ?? "TBD",
    homeName: hCode ? (teamNames[hCode] ?? hCode) : (feed1 ?? "TBD"),
    awayName: aCode ? (teamNames[aCode] ?? aCode) : (feed2 ?? "TBD"),
    homeFlag: hCode ? flagUrl(hCode) : null,
    awayFlag: aCode ? flagUrl(aCode) : null,
    group: isGroup ? group_or_stage : null,
    isGroupStage: isGroup,
    stageLabel: isGroup
      ? `Group ${group_or_stage}`
      : (stageLabels[group_or_stage] ?? group_or_stage),
    city: venue.city,
    stadium: venue.stadium,
    venueId: venue_id,
    channel,
    feedA: feed1 ?? null,
    feedB: feed2 ?? null,
  };
});

export const groupStageMatches = matches.filter((m) => m.isGroupStage);
export const chartDays = [...new Set(groupStageMatches.map((m) => m.date))];
