import { useActiveView } from "@/hooks/use-active-view";
import { DashboardBase } from "./dashboard-base";
import { DashboardGlance } from "./dashboard-glance";
import { DashboardPlan } from "./dashboard-plan";

export function WorkDashboard() {
  const view = useActiveView();
  if (view === "plan") return <DashboardPlan destination="work" />;
  return view === "glance" ? <DashboardGlance destination="work" /> : <DashboardBase destination="work" />;
}
