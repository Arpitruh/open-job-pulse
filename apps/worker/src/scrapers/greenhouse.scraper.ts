import { BaseScraper, type RawJobListing, type ScraperConfig } from "./base.scraper";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  content: string;
  absolute_url: string;
  updated_at: string;
  metadata: Array<{ name: string; value: any }>;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export class GreenhouseScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config, "Greenhouse");
  }

  async fetch(): Promise<RawJobListing[]> {
    // Greenhouse public API endpoint format:
    // https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true
    const boardToken = this.extractBoardToken(this.config.sourceUrl);
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;

    const res = await this.withRetry(() =>
      this.http.get<GreenhouseResponse>(apiUrl)
    );

    return res.data.jobs.map((job) => this.normalize(job));
  }

  normalize(job: GreenhouseJob): RawJobListing {
    const locationText = job.location?.name ?? "";
    const workMode = this.detectWorkMode(
      `${locationText} ${job.content}`
    );
    const salary = this.parseSalary(job.content ?? "");

    // Strip HTML from description
    const description = job.content
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? "";

    return {
      externalId: `greenhouse-${job.id}`,
      companyName: this.extractCompanyFromUrl(this.config.sourceUrl),
      jobTitle: job.title,
      locationRaw: locationText,
      workMode,
      baseSalaryMin: salary.min,
      baseSalaryMax: salary.max,
      currency: salary.currency,
      applyUrl: job.absolute_url,
      descriptionRaw: description,
      postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
    };
  }

  private extractBoardToken(url: string): string {
    // Handle both:
    // https://boards.greenhouse.io/company
    // https://boards-api.greenhouse.io/v1/boards/company/jobs
    const match = url.match(/greenhouse\.io\/(?:v1\/boards\/)?([^\/\?]+)/);
    return match?.[1] ?? url;
  }

  private extractCompanyFromUrl(url: string): string {
    const token = this.extractBoardToken(url);
    return token
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
}