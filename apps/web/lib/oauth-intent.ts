import crypto from "crypto";
import { Redis } from "ioredis";

async function withRedis<T>(fn: (redis: Redis) => Promise<T>): Promise<T> {
  if (!process.env.REDIS_URL) throw new Error("OAuth intent store unavailable");
  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1,
  });
  try { return await fn(redis); }
  finally { redis.disconnect(); }
}

export async function issueOAuthIntent(kind: "mode" | "link"): Promise<string> {
  const nonce = crypto.randomBytes(24).toString("hex");
  await withRedis(async redis => {
    const result = await redis.set("oauth-intent:" + kind + ":" + nonce, "1", "EX", 300, "NX");
    if (result !== "OK") throw new Error("Could not issue OAuth intent");
  });
  return nonce;
}

export async function consumeOAuthIntent(kind: "mode" | "link", nonce: unknown): Promise<boolean> {
  if (typeof nonce !== "string" || !/^[a-f0-9]{48}$/.test(nonce)) return false;
  try {
    return await withRedis(async redis =>
      (await redis.call("GETDEL", "oauth-intent:" + kind + ":" + nonce)) === "1"
    );
  } catch (error) {
    console.error("OAuth intent store unavailable", error);
    return false;
  }
}
