import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  ["/", "Overview"],
  ["/applications", "Applications"],
  ["/updates", "Updates"],
  ["/prepare", "Prepare"],
  ["/profile", "Profile"],
  ["/settings", "Settings"],
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <NavLink aria-label="Job Buddy home" className="app-shell__brand" to="/">Job Buddy</NavLink>
        <nav aria-label="Primary navigation" className="app-shell__nav">
          {navigation.map(([to, label]) => (
            <NavLink end={to === "/"} key={to} to={to}>{label}</NavLink>
          ))}
        </nav>
      </header>
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
