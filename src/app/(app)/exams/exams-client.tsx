"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ExamsTab } from "./exams-tab";
import { ScalesTab } from "./scales-tab";

type Tab = "exams" | "scales";

export function ExamsClient() {
  const t = useTranslations("exams");
  const [tab, setTab] = useState<Tab>("exams");

  const tabs: { id: Tab; label: string }[] = [
    { id: "exams", label: t("tabExams") },
    { id: "scales", label: t("tabScales") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "exams" && <ExamsTab />}
      {tab === "scales" && <ScalesTab />}
    </div>
  );
}
