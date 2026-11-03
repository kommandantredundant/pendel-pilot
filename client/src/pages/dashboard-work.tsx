import { useSettings } from "@/hooks/use-settings";
import { DashboardBase } from "./dashboard-base";
import { DashboardGlance } from "./dashboard-glance";

export function WorkDashboard() {
  const { data: settings } = useSettings();
  return settings?.glanceMode === 1 ? <DashboardGlance destination="work" /> : <DashboardBase destination="work" />;
}
