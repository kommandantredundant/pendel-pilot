import { useSettings } from "@/hooks/use-settings";
import { DashboardBase } from "./dashboard-base";
import { DashboardGlance } from "./dashboard-glance";

export function HomeDashboard() {
  const { data: settings } = useSettings();
  return settings?.glanceMode === 1 ? <DashboardGlance destination="home" /> : <DashboardBase destination="home" />;
}
