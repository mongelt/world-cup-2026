import rawMatches from "./matches.json";
import rawGroups from "./groups.json";
import rawVenues from "./venues.json";
import rawIso from "./iso.json";

const isoMap: Record<string, string> = rawIso as Record<string, string>;
const venueArr = rawVenues as Array<{ id: string; city: string; stad: string; co: string }>;
export const venues: Record<string, { city: string; stad: string; co: string }> = Object.fromEntries(
  venueArr.map((v) => [v.id, v])
);

type GroupEntry = [string, string, string];
export const groups: Record<string, GroupEntry[]> = rawGroups as Record<string, GroupEntry[]>;

export const teamNames: Record<string, string> = Object.fromEntries(
  Object.values(groups).flatMap((teams) => teams.map(([, code, name]) => [code, name]))
);

const stageLabels: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarterfinal",
  SF: "Semifinal",
  "3RD": "Third Place",
  FIN: "Final"
};

function parseTime(raw: string): string {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?([ap])$/);
  if (!m) return raw;
  return `${m[1]}:${m[2] ?? "00"} ${m[3] === "a" ? "AM" : "PM"} ET`;
}

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

export const flagUrl = (code: string) => `https://flagcdn.com/w40/${isoMap[code] ?? "xx"}.png`;

export const matches: Match[] = (rawMatches as unknown[][]).map((row) => {
  const [matchNumber, date, time, homeCode, awayCode, stageOrGroup, venueId, channel, feedA, feedB] =
    row as [number, string, string, string | null, string | null, string, string, string, string | null, string | null];
  const venue = venues[venueId] ?? { city: "TBD", stad: "TBD", co: "us" };
  const isGroup = /^[A-L]$/.test(stageOrGroup);
  const hCode = homeCode || null;
  const aCode = awayCode || null;
  return {
    matchNumber,
    date,
    timeRaw: time,
    timeLabel: parseTime(time),
    homeCode: hCode,
    awayCode: aCode,
    homeDisplay: hCode ?? feedA ?? "TBD",
    awayDisplay: aCode ?? feedB ?? "TBD",
    homeName: hCode ? (teamNames[hCode] ?? hCode) : (feedA ?? "TBD"),
    awayName: aCode ? (teamNames[aCode] ?? aCode) : (feedB ?? "TBD"),
    homeFlag: hCode ? flagUrl(hCode) : null,
    awayFlag: aCode ? flagUrl(aCode) : null,
    group: isGroup ? stageOrGroup : null,
    isGroupStage: isGroup,
    stageLabel: isGroup ? `Group ${stageOrGroup}` : (stageLabels[stageOrGroup] ?? stageOrGroup),
    city: venue.city,
    stadium: venue.stad,
    venueId,
    channel,
    feedA: feedA ?? null,
    feedB: feedB ?? null
  };
});

export const groupStageMatches = matches.filter((m) => m.isGroupStage);
export const chartDays = [...new Set(groupStageMatches.map((m) => m.date))];
