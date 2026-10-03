import { createHash, timingSafeEqual } from "node:crypto";
export function cronAuth(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    req.headers.get("x-cron-secret") ||
    "";
  return timingSafeEqual(
    createHash("sha256").update(secret).digest(),
    createHash("sha256").update(token).digest(),
  );
}
