import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { School } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BsDate } from "@/components/bs-date";
import { CreateSchoolDialog } from "./create-school-dialog";

export const metadata: Metadata = { title: "Schools" };

const statusTone = {
  active: "success",
  trial: "info",
  suspended: "warning",
  churned: "neutral",
} as const;

export default async function SchoolsPage() {
  const session = await getSession();
  if (!session?.superadmin) redirect("/dashboard");

  const t = await getTranslations("superadmin");

  const tenants = await withTenant(
    null,
    (tx) =>
      tx.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { users: true } } },
      }),
    { superadmin: true },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("schools")}</h1>
        <CreateSchoolDialog />
      </div>

      {tenants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-50">
              <School className="size-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{t("noSchools")}</h2>
            <p className="max-w-sm text-sm text-muted">{t("noSchoolsHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tenants.map((tenant) => (
            <Card key={tenant.publicId} className="transition-shadow hover:shadow-raised">
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{tenant.name}</h3>
                    {tenant.nameNe && (
                      <p lang="ne" className="truncate text-sm text-muted">
                        {tenant.nameNe}
                      </p>
                    )}
                  </div>
                  <Badge tone={statusTone[tenant.status]}>{tenant.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
                    /{tenant.slug}
                  </span>
                  <span>
                    {tenant._count.users} users · <BsDate date={tenant.createdAt} showAd={false} />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
