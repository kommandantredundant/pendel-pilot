import { Switch, Route, Redirect } from "wouter";
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
      <Route path="/towork" component={WorkDashboard}/>
      <Route path="/tohome" component={HomeDashboard}/>
      <Route path="/settings" component={SettingsPage}/>
      {/* "/" opens the way to work; the old paths stay working for existing bookmarks and home-screen links. */}
      <Route path="/"><Redirect to="/towork" replace /></Route>
      <Route path="/andback"><Redirect to="/tohome" replace /></Route>
      <Route path="/how"><Redirect to="/settings" replace /></Route>
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
