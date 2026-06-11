import { getTranslations } from "next-intl/server";
import { Hammer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export async function ComingSoon({ title }: { title: string }) {
  const t = await getTranslations("common");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
            <Hammer className="size-6 text-muted" />
          </div>
          <p className="text-sm text-muted">{t("noResults")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
