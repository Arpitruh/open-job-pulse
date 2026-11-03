// Email digest utilities — used by scheduler for daily/weekly batch sends

import { dispatchQueue } from "@ojp/queue";
import { db } from "@ojp/db";
import cron from "node-cron";

// Daily digest — 8am UTC
cron.schedule("0 8 * * *", async () => {
  console.log("[Email] Sending daily digests");

  const users = await db.userProfile.findMany({
    where: { emailDigest: "daily" },
    select: { userId: true },
  });

  for (const user of users) {
    await dispatchQueue.add(
      "send-email-digest",
      { userId: user.userId, digestType: "daily" },
      { jobId: `daily-digest-${user.userId}-${Date.now()}` }
    );
  }
});

// Weekly digest — Monday 9am UTC
cron.schedule("0 9 * * 1", async () => {
  console.log("[Email] Sending weekly digests");

  const users = await db.userProfile.findMany({
    where: { emailDigest: "weekly" },
    select: { userId: true },
  });

  for (const user of users) {
    await dispatchQueue.add(
      "send-email-digest",
      { userId: user.userId, digestType: "weekly" },
      { jobId: `weekly-digest-${user.userId}-${Date.now()}` }
    );
  }
});

export {};