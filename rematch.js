const { Queue } = require("bullmq");
const { Redis } = require("ioredis");
const { PrismaClient } = require("@prisma/client");
const redis = new Redis("redis://localhost:6379", { maxRetriesPerRequest: null, enableReadyCheck: false });
const queue = new Queue("matching", { connection: redis });
const db = new PrismaClient();
db.jobListing.findMany({ select: { id: true } }).then(async (listings) => {
  for (const l of listings) {
    await queue.add("match-jobs", { jobListingId: l.id }, { jobId: "rematch-" + l.id, attempts: 3 });
  }
  console.log("Re-enqueued", listings.length, "listings");
  await redis.disconnect();
  await db.$disconnect();
  process.exit(0);
});
