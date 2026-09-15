import { NavLink, Outlet } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { updateRepository } from "../features/updates/updateRepository";

const navigation = [
  ["/", "Overview"],
  ["/applications", "Applications"],
  ["/updates", "Updates"],
  ["/prepare", "Prepare"],
  ["/profile", "Profile"],
  ["/settings", "Settings"],
] as const;

export function AppShell() {
  const pending = useLiveQuery(() => updateRepository.listPending(), []);
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <NavLink aria-label="Job Buddy home" className="app-shell__brand" to="/">Job Buddy</NavLink>
        <nav aria-label="Primary navigation" className="app-shell__nav">
          {navigation.map(([to, label]) => (
            <NavLink aria-label={to === "/updates" && pending ? `Updates, ${pending.length} pending` : undefined} end={to === "/"} key={to} to={to}>{label}{to === "/updates" && pending && <span className="app-shell__badge" aria-hidden="true">{pending.length}</span>}</NavLink>
          ))}
        </nav>
      </header>
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
