import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return <section className="empty-state"><h2>{title}</h2>{children && <p>{children}</p>}{action}</section>;
}
