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
import LandingPage from "@/pages/landing";
import { LanguageProvider } from "@/lib/language-context";

function Router() {
  return (
    <Switch>
      <Route path="/towork" component={WorkDashboard}/>
      <Route path="/tohome" component={HomeDashboard}/>
      <Route path="/settings" component={SettingsPage}/>
      {/* The old paths stay working for existing bookmarks and home-screen links. */}
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
          <Switch>
            {/* "/" explains the app; it is a standalone page without the app's navigation. */}
            <Route path="/" component={LandingPage} />
            <Route>
              <Layout>
                <Router />
              </Layout>
            </Route>
          </Switch>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
