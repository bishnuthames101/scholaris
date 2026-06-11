import { cookies } from "next/headers";
import { ApiError, handler, ok } from "@/lib/api";
import { refresh } from "@/lib/auth/service";
import { REFRESH_COOKIE, setAuthCookies } from "@/lib/auth/session";

export const POST = handler(async (req: Request) => {
  const jar = await cookies();
  const token = jar.get(REFRESH_COOKIE)?.value;
  if (!token) throw new ApiError("INVALID_REFRESH", "No session", 401);

  const result = await refresh(token, {
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  });
  await setAuthCookies(result.accessToken, result.refreshToken);
  return ok({ user: result.user });
});
