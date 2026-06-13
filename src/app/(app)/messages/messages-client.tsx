"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { SendTab } from "./send-tab";
import { TemplatesTab } from "./templates-tab";
import { LogTab } from "./log-tab";
import { CreditsTab } from "./credits-tab";
import { GroupsTab } from "./groups-tab";
import { ChannelSettingsTab } from "./channel-settings-tab";

type Tab = "send" | "templates" | "log" | "credits" | "groups" | "settings";

export function MessagesClient() {
  const t = useTranslations("messages");
  const [tab, setTab] = useState<Tab>("send");

  const tabs: { id: Tab; label: string }[] = [
    { id: "send", label: t("tabSend") },
    { id: "templates", label: t("tabTemplates") },
    { id: "log", label: t("tabLog") },
    { id: "credits", label: t("tabCredits") },
    { id: "groups", label: t("tabGroups") },
    { id: "settings", label: t("tabSettings") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "send" && <SendTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "log" && <LogTab />}
      {tab === "credits" && <CreditsTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "settings" && <ChannelSettingsTab />}
    </div>
  );
}
