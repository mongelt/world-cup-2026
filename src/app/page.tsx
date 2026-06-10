import { matches, groups, chartDays, groupStageMatches } from "@/lib/schedule";
import ScheduleApp from "./ScheduleApp";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ScheduleApp
      matches={matches}
      groups={groups}
      chartDays={chartDays}
      groupStageMatches={groupStageMatches}
    />
  );
}
