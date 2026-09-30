import { Button } from "../../components/Button";

export function RecheckMailControl({ disabled, onRecheck }: { disabled: boolean; onRecheck(): void }) {
  return <details className="mail-recheck">
    <summary>Missing an email or application update?</summary>
    <p>Recheck up to 500 recent inbox messages from the last 90 days, excluding Promotions and Social. Previously skipped messages are reconsidered. Existing proposals and reviewed decisions stay unchanged; recovered updates always wait for your review.</p>
    <Button variant="secondary" disabled={disabled} onClick={onRecheck}>Recheck recent emails</Button>
  </details>;
}
