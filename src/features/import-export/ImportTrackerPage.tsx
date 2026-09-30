import { Link } from "react-router-dom";
import { TrackerImportPanel } from "./TrackerImportPanel";
export function ImportTrackerPage() {
  return <div><header className="tracker-heading"><h1>Import tracker</h1><Link to="/applications">Back to applications</Link></header><TrackerImportPanel /></div>;
}
