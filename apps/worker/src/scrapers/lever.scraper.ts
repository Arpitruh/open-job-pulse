import { BaseScraper, type RawJobListing, type ScraperConfig } from "./base.scraper";

interface LeverPosting {
  id: string;
  text: string; // job title
  categories: {
    location?: string;
    team?: string;
    commitment?: string;
  };
  description: string;
  descriptionPlain: string;
  lists: Array<{ text: string; content: string }>;
  additional: string;
  additionalPlain: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  };
}

export class LeverScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config, "Lever");
  }

  async fetch(): Promise<RawJobListing[]> {
    // Lever public API:
    // https://api.lever.co/v0/postings/{company}?mode=json
    const company = this.extractCompanySlug(this.config.sourceUrl);
    const apiUrl = `https://api.lever.co/v0/postings/${company}?mode=json`;

    const res = await this.withRetry(() =>
      this.http.get<LeverPosting[]>(apiUrl)
    );

    return res.data.map((job) => this.normalize(job));
  }

  normalize(job: LeverPosting): RawJobListing {
    const locationText = job.categories?.location ?? "";
    const commitment = job.categories?.commitment ?? "";
    const workMode = this.detectWorkMode(
      `${locationText} ${commitment} ${job.descriptionPlain ?? ""}`
    );

    // Build full description from all sections
    const descParts = [
      job.descriptionPlain ?? "",
      ...(job.lists ?? []).map((l) =>
        `${l.text}:\n${l.content.replace(/<[^>]+>/g, " ")}`
      ),
      job.additionalPlain ?? "",
    ].filter(Boolean);

    const description = descParts.join("\n\n").slice(0, 10_000);

    // Use Lever's salary range if available, otherwise parse from text
    let salaryMin = job.salaryRange?.min;
    let salaryMax = job.salaryRange?.max;
    let currency = job.salaryRange?.currency ?? "USD";

    if (!salaryMin) {
      const parsed = this.parseSalary(description);
      salaryMin = parsed.min;
      salaryMax = parsed.max;
      currency = parsed.currency ?? "USD";
    }

    return {
      externalId: `lever-${job.id}`,
      companyName: this.extractCompanyName(this.config.sourceUrl),
      jobTitle: job.text,
      locationRaw: locationText,
      workMode,
      baseSalaryMin: salaryMin,
      baseSalaryMax: salaryMax,
      currency,
      applyUrl: job.hostedUrl,
      descriptionRaw: description,
      postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
    };
  }

  private extractCompanySlug(url: string): string {
    const match = url.match(/lever\.co\/([^\/\?]+)/);
    return match?.[1] ?? url;
  }

  private extractCompanyName(url: string): string {
    const slug = this.extractCompanySlug(url);
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
}