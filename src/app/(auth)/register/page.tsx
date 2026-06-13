"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";

export default function RegisterPage() {
  const t = useTranslations("portal");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [form, setForm] = useState({
    schoolSlug: "",
    name: "",
    phone: "",
    email: "",
    admissionNo: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolSlug: form.schoolSlug,
          name: form.name,
          phone: form.phone,
          email: form.email || undefined,
          admissionNo: form.admissionNo,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("registrationFailed"));
        return;
      }
      setSuccess(true);
    } catch {
      setError(t("registrationFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Logo />
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">
            <h2 className="text-lg font-semibold text-green-800">{t("registrationSuccess")}</h2>
            <p className="mt-2 text-sm text-green-700">{t("registrationSuccessHint")}</p>
          </div>
          <Link href="/login" className="inline-block rounded-md bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {tAuth("login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo />
          <h1 className="mt-4 text-xl font-bold text-foreground">{t("parentRegistration")}</h1>
          <p className="mt-1 text-sm text-muted">{t("parentRegistrationHint")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("schoolCode")}</label>
            <input
              value={form.schoolSlug}
              onChange={set("schoolSlug")}
              placeholder="e.g. demo"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              required
            />
            <p className="mt-0.5 text-xs text-muted">{t("schoolCodeHint")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("yourName")}</label>
            <input value={form.name} onChange={set("name")} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("phoneNumber")}</label>
            <input value={form.phone} onChange={set("phone")} type="tel" placeholder="+977-98XXXXXXXX" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
            <p className="mt-0.5 text-xs text-muted">{t("phoneHint")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("email")} ({t("optional")})</label>
            <input value={form.email} onChange={set("email")} type="email" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("childAdmissionNo")}</label>
            <input value={form.admissionNo} onChange={set("admissionNo")} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
            <p className="mt-0.5 text-xs text-muted">{t("admissionNoHint")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{tAuth("password")}</label>
            <input value={form.password} onChange={set("password")} type="password" minLength={8} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t("confirmPassword")}</label>
            <input value={form.confirm} onChange={set("confirm")} type="password" minLength={8} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" required />
          </div>

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "..." : t("register")}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            {tAuth("login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
