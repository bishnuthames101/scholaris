"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 w-full appearance-none rounded-md border bg-surface px-3 pr-9 text-sm text-foreground",
          "transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
          invalid
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border-strong",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  ),
);
Select.displayName = "Select";
