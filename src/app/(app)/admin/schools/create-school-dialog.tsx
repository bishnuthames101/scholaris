"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function CreateSchoolDialog() {
  const t = useTranslations("superadmin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          nameNe: form.get("nameNe") || undefined,
          slug: form.get("slug"),
          admin: {
            name: form.get("adminName"),
            email: form.get("adminEmail"),
            password: form.get("adminPassword"),
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? tc("error"));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("createSchool")}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-overlay">
            <button
              className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-surface-muted"
              onClick={() => setOpen(false)}
              aria-label={tc("cancel")}
            >
              <X className="size-4.5" />
            </button>
            <h2 className="mb-5 text-lg font-semibold text-foreground">{t("createSchool")}</h2>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field label={t("schoolName")} htmlFor="name" required>
                <Input id="name" name="name" required placeholder="Sunrise English School" />
              </Field>
              <Field label={t("schoolNameNe")} htmlFor="nameNe">
                <Input id="nameNe" name="nameNe" lang="ne" placeholder="सनराइज इङ्ग्लिस स्कुल" />
              </Field>
              <Field label={t("slug")} htmlFor="slug" required>
                <Input
                  id="slug"
                  name="slug"
                  required
                  pattern="[a-z0-9-]+"
                  placeholder="sunrise"
                  className="font-mono"
                />
              </Field>

              <div className="border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium text-foreground">{t("adminDetails")}</p>
                <div className="space-y-4">
                  <Field label={t("adminName")} htmlFor="adminName" required>
                    <Input id="adminName" name="adminName" required />
                  </Field>
                  <Field label={t("adminEmail")} htmlFor="adminEmail" required>
                    <Input id="adminEmail" name="adminEmail" type="email" required />
                  </Field>
                  <Field label={t("adminPassword")} htmlFor="adminPassword" required>
                    <Input
                      id="adminPassword"
                      name="adminPassword"
                      type="password"
                      minLength={8}
                      required
                    />
                  </Field>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-danger/20 bg-danger-bg px-3 py-2.5 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" loading={loading}>
                  {tc("create")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
