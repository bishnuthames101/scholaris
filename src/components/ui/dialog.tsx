"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-6 shadow-overlay",
          className,
        )}
      >
        <button
          className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-surface-muted"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4.5" />
        </button>
        <h2 className="mb-5 pr-8 text-lg font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}
