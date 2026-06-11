"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground",
        "placeholder:text-faint transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
        invalid ? "border-danger focus:border-danger focus:ring-danger/20" : "border-border-strong",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
