import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Plans ────────────────────────────────────────────────────────────────
  const plans = [
    {
      name: "Weekly",
      stripePriceId: process.env.STRIPE_PRICE_WEEKLY ?? "price_weekly_placeholder",
      interval: "WEEKLY" as const,
      amountCents: 499,
      currency: "usd",
      creditsPerCycle: 30,
    },
    {
      name: "Monthly",
      stripePriceId: process.env.STRIPE_PRICE_MONTHLY ?? "price_monthly_placeholder",
      interval: "MONTHLY" as const,
      amountCents: 1499,
      currency: "usd",
      creditsPerCycle: 150,
    },
    {
      name: "Yearly",
      stripePriceId: process.env.STRIPE_PRICE_YEARLY ?? "price_yearly_placeholder",
      interval: "YEARLY" as const,
      amountCents: 9900,
      currency: "usd",
      creditsPerCycle: 2500,
    },
  ];

  for (const plan of plans) {
    await db.plan.upsert({
      where: { stripePriceId: plan.stripePriceId },
      update: plan,
      create: plan,
    });
    console.log(`  ✓ Plan: ${plan.name}`);
  }

  // ── Credit Packs ─────────────────────────────────────────────────────────
  const packs = [
    {
      name: "Starter Pack",
      stripePriceId: process.env.STRIPE_PACK_STARTER ?? "price_pack_starter_placeholder",
      credits: 100,
      amountCents: 499,
    },
    {
      name: "Pro Pack",
      stripePriceId: process.env.STRIPE_PACK_PRO ?? "price_pack_pro_placeholder",
      credits: 300,
      amountCents: 999,
    },
    {
      name: "Power Pack",
      stripePriceId: process.env.STRIPE_PACK_POWER ?? "price_pack_power_placeholder",
      credits: 800,
      amountCents: 1999,
    },
  ];

  for (const pack of packs) {
    await db.creditPack.upsert({
      where: { stripePriceId: pack.stripePriceId },
      update: pack,
      create: pack,
    });
    console.log(`  ✓ Credit Pack: ${pack.name}`);
  }

  // ── Admin user (from ADMIN_EMAIL env) ────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const existing = await db.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const passwordHash = await hash("ChangeMe123!", {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const admin = await db.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          role: "ADMIN",
          identityLockedAt: new Date(),
          phoneNumber: "+10000000000",
          phoneVerified: true,
          linkedinId: "admin-seed-linkedin-id",
        },
      });

      await db.userProfile.create({
        data: {
          userId: admin.id,
          fullName: "Admin",
          creditBalance: 9999,
          creditsLifetime: 9999,
        },
      });

      await db.subscription.create({
        data: {
          userId: admin.id,
          stripeCustomerId: `admin_local_${admin.id}`,
          status: "ACTIVE",
        },
      });

      const workspace = await db.workspace.create({
        data: { name: "Admin Workspace", slug: `admin-${admin.id}` },
      });

      await db.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: admin.id, role: "owner" },
      });

      console.log(`  ✓ Admin user: ${adminEmail} (password: ChangeMe123!)`);
      console.log(`  ⚠️  Change the admin password immediately after first login`);
    } else {
      // Ensure existing user has admin role
      await db.user.update({
        where: { email: adminEmail },
        data: { role: "ADMIN" },
      });
      console.log(`  ✓ Admin role ensured for: ${adminEmail}`);
    }
  }

  console.log("\n✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());