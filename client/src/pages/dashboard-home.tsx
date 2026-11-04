import { useActiveView } from "@/hooks/use-active-view";
import { DashboardBase } from "./dashboard-base";
import { DashboardGlance } from "./dashboard-glance";
import { DashboardPlan } from "./dashboard-plan";

export function HomeDashboard() {
  const view = useActiveView();
  if (view === "loading") return null;
  if (view === "plan") return <DashboardPlan destination="home" />;
  return view === "glance" ? <DashboardGlance destination="home" /> : <DashboardBase destination="home" />;
}
