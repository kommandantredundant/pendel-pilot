import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout";
import { WorkDashboard } from "@/pages/dashboard-work";
import { HomeDashboard } from "@/pages/dashboard-home";
import SettingsPage from "@/pages/settings";
import { LanguageProvider } from "@/lib/language-context";

function Router() {
  return (
    <Switch>
      <Route path="/" component={WorkDashboard}/>
      <Route path="/andback" component={HomeDashboard}/>
      <Route path="/how" component={SettingsPage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Layout>
            <Router />
          </Layout>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
