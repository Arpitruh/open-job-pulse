import robotsParser from "robots-parser";
import axios from "axios";

const cache = new Map<string, { robots: any; expires: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows scraping: ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export async function isAllowed(url: string, userAgent = "*"): Promise<boolean> {
  try {
    const { origin } = new URL(url);
    const robotsUrl = `${origin}/robots.txt`;
    const now = Date.now();

    let cached = cache.get(origin);
    if (!cached || cached.expires < now) {
      const res = await axios.get(robotsUrl, {
        timeout: 5000,
        validateStatus: () => true,
      });
      const text = res.status === 200 ? res.data : "";
      const robots = robotsParser(robotsUrl, text);
      cached = { robots, expires: now + TTL };
      cache.set(origin, cached);
    }

    return cached.robots.isAllowed(url, userAgent) ?? true;
  } catch {
    // If robots.txt unreachable, assume allowed
    return true;
  }
}

export async function checkRobots(url: string): Promise<void> {
  const allowed = await isAllowed(url);
  if (!allowed) throw new RobotsDisallowedError(url);
}