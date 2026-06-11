import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell
      user={{
        roles: session.roles,
        superadmin: session.superadmin,
      }}
    >
      {children}
    </AppShell>
  );
}
