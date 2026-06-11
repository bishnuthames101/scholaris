import { SignJWT, jwtVerify } from "jose";

export type AccessClaims = {
  sub: string; // user publicId
  tenantId: string | null; // tenant publicId (null for superadmin)
  tenantDbId: string | null; // internal tenant id as string, for RLS GUC
  roles: string[]; // role keys
  superadmin: boolean;
  locale: string;
};

const encoder = new TextEncoder();

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return encoder.encode(s);
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("scholaris")
    .setExpirationTime(process.env.JWT_ACCESS_TTL ?? "15m")
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "scholaris" });
    return payload as unknown as AccessClaims;
  } catch {
    return null;
  }
}
