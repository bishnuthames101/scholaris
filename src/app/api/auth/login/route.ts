import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { login } from "@/lib/auth/service";
import { setAuthCookies } from "@/lib/auth/session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  school: z.string().optional(), // school slug, for multi-school emails
});

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, LoginSchema);
  const result = await login(body.email, body.password, body.school, {
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  });
  await setAuthCookies(result.accessToken, result.refreshToken);
  return ok({ user: result.user });
});
