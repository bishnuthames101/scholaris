"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { InvoicesTab } from "./invoices-tab";
import { StructureTab } from "./structure-tab";
import { ReportsTab } from "./reports-tab";

type Tab = "invoices" | "structure" | "reports";

export function FeesClient() {
  const t = useTranslations("fees");
  const [tab, setTab] = useState<Tab>("invoices");

  const tabs: { id: Tab; label: string }[] = [
    { id: "invoices", label: t("tabInvoices") },
    { id: "structure", label: t("tabStructure") },
    { id: "reports", label: t("tabReports") },
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

      {tab === "invoices" && <InvoicesTab />}
      {tab === "structure" && <StructureTab />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}
