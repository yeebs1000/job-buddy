import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ className = "", variant = "primary", ...props }: ButtonProps) {
  return <button className={`button button--${variant} ${className}`.trim()} type="button" {...props} />;
}
