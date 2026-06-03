import React from "react";
import ReactDOM from "react-dom/client";
import { Activity, Server } from "lucide-react";
import { adminFrontDomain } from "ndx/admin/front";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import "./styles.css";

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Primary" className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a className="text-base font-semibold" href="/">
            admin
          </a>
          <Button asChild variant="outline" size="sm">
            <a href="/health">
              <Activity aria-hidden="true" className="h-4 w-4" />
              Health
            </a>
          </Button>
        </nav>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10" aria-labelledby="page-title">
        <section aria-labelledby="page-title" className="grid gap-3">
          <h1 id="page-title" className="text-3xl font-semibold tracking-normal">
            admin service
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Administration surface for ndx accounts, sessions, and operations.
          </p>
        </section>
        <section aria-labelledby="runtime-title">
          <Card>
            <CardHeader>
              <CardTitle id="runtime-title" className="flex items-center gap-2">
                <Server aria-hidden="true" className="h-5 w-5 text-emerald-600" />
                Runtime status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p role="status" data-testid="service-state" className="text-sm text-slate-700">
                {adminFrontDomain.surface} runtime ready for local verification.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
