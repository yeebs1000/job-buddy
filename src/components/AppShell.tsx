import { Component, Suspense, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { updateRepository } from "../features/updates/updateRepository";
import { ActiveGmailSync } from "../features/updates/ActiveGmailSync";
import { isWebMode } from "../app/runtimeMode";

const navigation = [
  ["/", "Overview"],
  ["/applications", "Applications"],
  ["/discover", "Discover"],
  ["/updates", "Updates"],
  ["/profile", "Profile"],
  ["/settings", "Settings"],
] as const;

export function AppShell() {
  const location = useLocation();
  const pending = useLiveQuery(() => updateRepository.listPending(), []);
  return (
    <div className="app-shell">
      {!isWebMode && <ActiveGmailSync />}
      <header className="app-shell__header">
        <NavLink aria-label="Job Buddy home" className="app-shell__brand" to="/">Job Buddy</NavLink>
        <nav aria-label="Primary navigation" className="app-shell__nav">
          {navigation.map(([to, label]) => (
            <NavLink aria-label={to === "/updates" && pending ? `Updates, ${pending.length} pending` : undefined} end={to === "/"} key={to} to={to}>{label}{to === "/updates" && pending && <span className="app-shell__badge" aria-hidden="true">{pending.length}</span>}</NavLink>
          ))}
        </nav>
      </header>
      <main className="app-shell__main">
        <PageBoundary key={location.pathname}>
          <Suspense fallback={<section aria-busy="true"><p role="status">Opening page…</p></section>}><Outlet /></Suspense>
        </PageBoundary>
      </main>
    </div>
  );
}

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert"><h1>This page could not be opened</h1><p>Your saved tracker is still here. Reload to try again, or use the navigation above.</p><button className="button button--secondary" onClick={() => window.location.reload()}>Reload page</button></section>;
    return this.props.children;
  }
}
