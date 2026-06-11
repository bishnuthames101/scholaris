import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BsDate } from "@/components/bs-date";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            <BsDate date={new Date()} />
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50">
            <Sparkles className="size-6 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t("emptyTitle")}</h2>
          <p className="max-w-sm text-sm text-muted">{t("emptySubtitle")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
