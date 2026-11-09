import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const roles = ["leadership", "registration", "guide", "health", "kitchen"] as const;
export type Role = typeof roles[number];

export function isRole(value: string): value is Role {
  return roles.some(role => role === value);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function demoSecret() {
  const secret = process.env.PDV_SESSION_SECRET;
  return process.env.PDV_LOCAL_DEMO === "1" && secret && secret.length >= 32 ? secret : undefined;
}

export function validDemoPassword(role: Role, password: string) {
  const expected = process.env["PDV_" + role.toUpperCase() + "_PASSWORD"];
  return Boolean(demoSecret() && expected && expected.length >= 12 && safeEqual(expected, password));
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export async function setSession(role: Role) {
  const secret = demoSecret();
  if (!secret) throw new Error("Demo session disabled");
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const value = role + "." + expires;
  (await cookies()).set("pdv-session", value + "." + sign(value, secret), {
    httpOnly: true, sameSite: "strict", path: "/", expires: new Date(expires),
  });
}

export async function currentRole(): Promise<Role | null> {
  const secret = demoSecret();
  const value = (await cookies()).get("pdv-session")?.value;
  if (!secret || !value) return null;
  const [role, expires, signature, extra] = value.split(".");
  if (!isRole(role) || !signature || extra || !/^\d+$/.test(expires) || Number(expires) <= Date.now()) return null;
  return safeEqual(signature, sign(role + "." + expires, secret)) ? role : null;
}
