import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-brand-950 p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60rem 30rem at -10% 110%, #0d9488 0%, transparent 55%), radial-gradient(40rem 24rem at 110% -10%, #115e59 0%, transparent 60%)",
          }}
        />
        <Logo className="relative [&_span:last-child]:text-white" />
        <div className="relative space-y-4">
          <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
            {t("common.tagline")}
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-brand-200">
            SIS · Attendance · Fees · Exams · Messaging — one workspace for your whole school.
          </p>
        </div>
        <p className="relative text-xs text-brand-300/70">
          © {new Date().getFullYear()} Scholaris · Tomorrow&apos;s Tech
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <Logo className="lg:hidden" />
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {t("auth.loginTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">{t("auth.loginSubtitle")}</p>
            </div>
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
