"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [needsSchool, setNeedsSchool] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    const school = String(form.get("school") ?? "").trim();
    if (school) payload.school = school;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.success) {
        if (json.error?.code === "SCHOOL_REQUIRED") {
          setNeedsSchool(true);
          setError(json.error.message);
        } else {
          setError(json.error?.message ?? t("invalidCredentials"));
        }
        return;
      }

      const user = json.data.user;
      router.replace(user.superadmin ? "/admin/schools" : "/dashboard");
      router.refresh();
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label={t("email")} htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu.np"
          required
          invalid={!!error}
        />
      </Field>

      <Field label={t("password")} htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          invalid={!!error}
        />
      </Field>

      {needsSchool && (
        <Field label={t("school")} htmlFor="school" hint={t("schoolHint")}>
          <Input id="school" name="school" placeholder="my-school" autoFocus />
        </Field>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/20 bg-danger-bg px-3 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {loading ? t("loggingIn") : t("login")}
      </Button>
    </form>
  );
}
