import axios, { AxiosInstance } from "axios";
import { db } from "@ojp/db";
import { checkRobots } from "./robots.checker";
import crypto from "crypto";

export interface RawJobListing {
  externalId: string;
  companyName: string;
  jobTitle: string;
  locationRaw: string;
  workMode: "REMOTE" | "HYBRID" | "ON_SITE";
  baseSalaryMin?: number;
  baseSalaryMax?: number;
  currency?: string;
  applyUrl: string;
  descriptionRaw: string;
  postedAt?: Date;
}

export interface NormalizedListing extends RawJobListing {
  contentHash: string;
  sourcePortal: string;
}

export interface ScraperConfig {
  id: string;
  label: string;
  sourceUrl: string;
  workspaceId: string;
  requestsPerMin: number;
  delayMs: number;
  maxRetries: number;
}

export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected http: AxiosInstance;
  protected sourcePortal: string;

  constructor(config: ScraperConfig, sourcePortal: string) {
    this.config = config;
    this.sourcePortal = sourcePortal;
    this.http = axios.create({
      timeout: 15_000,
      headers: {
        "User-Agent":
          "OpenJobPulse/1.0 (+https://openjobpulse.com/bot)",
        Accept: "application/json, text/html",
      },
    });
  }

  // Abstract methods — implement in each adapter
  abstract fetch(): Promise<RawJobListing[]>;
  abstract normalize(raw: any): RawJobListing;

  // Utility: compute SHA-256 content hash for deduplication
  protected computeHash(
    companyName: string,
    jobTitle: string,
    description: string
  ): string {
    const normalized = [
      companyName.toLowerCase().trim(),
      jobTitle.toLowerCase().trim(),
      description.slice(0, 500).toLowerCase().trim(),
    ].join("|");
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  // Utility: parse work mode from text
  protected detectWorkMode(text: string): "REMOTE" | "HYBRID" | "ON_SITE" {
    const lower = text.toLowerCase();
    if (lower.includes("remote") && lower.includes("hybrid")) return "HYBRID";
    if (lower.includes("remote")) return "REMOTE";
    if (lower.includes("hybrid")) return "HYBRID";
    if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in office"))
      return "ON_SITE";
    return "REMOTE";
  }

  // Utility: parse salary from text
  protected parseSalary(text: string): {
  min?: number;
  max?: number;
  currency?: string;
} {
  const patterns = [
    /\$(\d{2,3})[kK]\s*[-–]\s*\$?(\d{2,3})[kK]/,
    /(\d{3},\d{3})\s*[-–]\s*(\d{3},\d{3})/,
    /\$(\d{2,3})[kK]/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const raw1 = match[1];
      const raw2 = match[2];
      if (!raw1) continue;

      const cleaned1 = raw1.replace(",", "");
      const min = parseInt(cleaned1) * (cleaned1.length <= 3 ? 1000 : 1);

      let max: number | undefined;
      if (raw2) {
        const cleaned2 = raw2.replace(",", "");
        max = parseInt(cleaned2) * (cleaned2.length <= 3 ? 1000 : 1);
      }

      return { min, max, currency: "USD" };
    }
  }
  return {};
}
  // Utility: rate-limited sleep
  protected async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Utility: retry with backoff
  protected async withRetry<T>(
    fn: () => Promise<T>,
    retries = 3
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        if (i === retries - 1) throw err;
        const wait = Math.pow(2, i) * 1000;
        console.warn(`[Scraper] Retry ${i + 1}/${retries} after ${wait}ms: ${err.message}`);
        await this.sleep(wait);
      }
    }
    throw new Error("Max retries exceeded");
  }

  // Main run method — called by worker
  async run(): Promise<{
    ingested: number;
    skipped: number;
    errors: number;
  }> {
    // Check robots.txt
    await checkRobots(this.config.sourceUrl);

    console.log(`[${this.sourcePortal}] Starting scrape: ${this.config.sourceUrl}`);

    let ingested = 0;
    let skipped = 0;
    let errors = 0;

    const listings = await this.fetch();
    console.log(`[${this.sourcePortal}] Fetched ${listings.length} raw listings`);

    for (const raw of listings) {
      try {
        const contentHash = this.computeHash(
          raw.companyName,
          raw.jobTitle,
          raw.descriptionRaw
        );

        // Dedup check
        const existing = await db.jobListing.findUnique({
          where: { contentHash },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Store listing
        await db.jobListing.create({
          data: {
            contentHash,
            companyName: raw.companyName,
            jobTitle: raw.jobTitle,
            locationRaw: raw.locationRaw,
            workMode: raw.workMode,
            baseSalaryMin: raw.baseSalaryMin,
            baseSalaryMax: raw.baseSalaryMax,
            currency: raw.currency ?? "USD",
            applyUrl: raw.applyUrl,
            sourcePortal: this.sourcePortal,
            descriptionRaw: raw.descriptionRaw,
            postedAt: raw.postedAt,
          },
        });

        ingested++;

        // Rate limiting
        const delayMs = (60_000 / this.config.requestsPerMin);
        await this.sleep(delayMs);
      } catch (err: any) {
        console.error(`[${this.sourcePortal}] Error processing listing:`, err.message);
        errors++;
      }
    }

    console.log(
      `[${this.sourcePortal}] Done: ${ingested} ingested, ${skipped} skipped, ${errors} errors`
    );

    return { ingested, skipped, errors };
  }
}