import RSSParser from "rss-parser";
import { BaseScraper, type RawJobListing, type ScraperConfig } from "./base.scraper";

interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  "content:encoded"?: string;
  author?: string;
  categories?: string[];
  guid?: string;
}

export class RssScraper extends BaseScraper {
  private parser: RSSParser;

  constructor(config: ScraperConfig) {
    super(config, "RSS");
    this.parser = new RSSParser({
      customFields: {
        item: ["content:encoded", "author"],
      },
    });
  }

  async fetch(): Promise<RawJobListing[]> {
    const feed = await this.withRetry(() =>
      this.parser.parseURL(this.config.sourceUrl)
    );

    // Try to get company name from feed title
    const feedTitle = feed.title ?? "Unknown Company";

    return feed.items
      .filter((item) => item.title && item.link)
      .map((item) => this.normalize({ ...item, feedTitle }));
  }

  normalize(item: RSSItem & { feedTitle: string }): RawJobListing {
    const rawContent =
      (item as any)["content:encoded"] ??
      item.content ??
      item.contentSnippet ??
      "";

    // Strip HTML
    const description = rawContent
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const fullText = `${item.title ?? ""} ${description}`;
    const workMode = this.detectWorkMode(fullText);
    const salary = this.parseSalary(fullText);

    // Try to extract location from categories or description
    const locationRaw =
      item.categories?.find(
        (c) =>
          c.toLowerCase().includes("remote") ||
          c.toLowerCase().includes("location")
      ) ?? "See listing";

    return {
      externalId: `rss-${item.guid ?? item.link ?? Math.random()}`,
      companyName: item.feedTitle ?? "Unknown",
      jobTitle: item.title ?? "Untitled Position",
      locationRaw,
      workMode,
      baseSalaryMin: salary.min,
      baseSalaryMax: salary.max,
      currency: salary.currency,
      applyUrl: item.link ?? "",
      descriptionRaw: description.slice(0, 10_000),
      postedAt: item.pubDate ? new Date(item.pubDate) : undefined,
    };
  }
}