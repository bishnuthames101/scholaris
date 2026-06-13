import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Parent/student users go to their portal — not the admin UI
  const portalOnly =
    !session.superadmin &&
    (session.roles.includes("parent") || session.roles.includes("student")) &&
    !session.roles.some((r) =>
      ["school_admin", "principal", "accountant", "teacher", "class_teacher", "front_desk"].includes(r),
    );
  if (portalOnly) redirect("/portal");

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
