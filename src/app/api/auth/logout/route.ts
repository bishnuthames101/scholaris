import { cookies } from "next/headers";
import { handler, ok } from "@/lib/api";
import { logout } from "@/lib/auth/service";
import { clearAuthCookies, REFRESH_COOKIE } from "@/lib/auth/session";

export const POST = handler(async () => {
  const jar = await cookies();
  await logout(jar.get(REFRESH_COOKIE)?.value);
  await clearAuthCookies();
  return ok({ loggedOut: true });
});
