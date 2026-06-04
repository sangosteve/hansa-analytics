import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NavBar from "@/components/layout/nav";
import Home from "@/pages/home";
import Movement from "@/pages/movement";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { CompanyProvider } from "@/lib/company-context";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/movement" component={Movement} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CompanyProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
              <NavBar />
              <div className="flex-1 min-h-0 overflow-hidden">
                <Router />
              </div>
            </div>
          </WouterRouter>
        </CompanyProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
