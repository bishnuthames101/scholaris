import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BsDate } from "@/components/bs-date";
import { DashboardAnalytics } from "./dashboard-analytics";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            <BsDate date={new Date()} />
          </p>
        </div>
      </div>

      <DashboardAnalytics />
    </div>
  );
}
