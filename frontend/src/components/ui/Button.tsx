import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ children, variant = "primary", ...props }: PropsWithChildren<ButtonProps>) {
  const className =
    variant === "primary"
      ? "rounded bg-paper-accent px-4 py-2 text-white"
      : "rounded border border-slate-300 px-4 py-2";

  return (
    <button className={className} type="button" {...props}>
      {children}
    </button>
  );
}
