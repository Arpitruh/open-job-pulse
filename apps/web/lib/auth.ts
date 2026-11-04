import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import LinkedInProvider from "next-auth/providers/linkedin";
import { db } from "@ojp/db";
import { verify } from "argon2";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { consumeOAuthIntent } from "@/lib/oauth-intent";
import { stripe } from "@/lib/stripe";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/onboarding/verify-phone",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { subscription: true },
        });
        if (!user?.passwordHash) return null;

        const valid = await verify(user.passwordHash, credentials.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          identityLockedAt: user.identityLockedAt?.toISOString() ?? null,
        };
      },
    }),
   LinkedInProvider({
  clientId: process.env.LINKEDIN_CLIENT_ID!,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
  issuer: "https://www.linkedin.com/oauth",
  jwks_endpoint: "https://www.linkedin.com/oauth/openid/jwks",
  authorization: {
    params: { scope: "openid profile email" },
  },
  async profile(profile) {
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      linkedinId: profile.sub,
      linkedinProfileUrl: profile.profile ?? null,
      role: "USER",               // ← add this
      identityLockedAt: null,     // ← add this
    };
  },
}),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "linkedin") return true;

      const linkedinId = account.providerAccountId;
      const email = user.email?.trim().toLowerCase();
      if (!linkedinId || !email) return false;

      const emailHash = crypto.createHash("sha256").update(email).digest("hex");
      const [blockedLinkedIn, blockedEmail] = await Promise.all([
        db.blockedIdentity.findUnique({ where: { linkedinId } }),
        db.blockedIdentity.findUnique({ where: { emailHash } }),
      ]);
      if (blockedLinkedIn || blockedEmail) return "/register?error=blocked";

      // Link only after an explicit action by an already authenticated user.
      const intent = (await cookies()).get("ojp_link_linkedin")?.value;
      let linkingUserId: string | null = null;
      if (intent && process.env.NEXTAUTH_SECRET) {
        const [encoded, signature] = intent.split(".");
        if (encoded && signature) {
          const expected = crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET)
            .update(encoded).digest("hex");
          if (signature.length === expected.length &&
              crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            try {
              const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
                userId: string; expires: number; nonce?: string;
              };
              if (payload.userId && payload.expires > Date.now()) {
                const request = new Request(process.env.NEXTAUTH_URL + "/api/auth/session", {
                  headers: await headers(),
                });
                const activeToken = await getToken({
                  req: request as Parameters<typeof getToken>[0]["req"],
                  secret: process.env.NEXTAUTH_SECRET,
                });
                if (activeToken?.id === payload.userId && await consumeOAuthIntent("link", payload.nonce)) linkingUserId = payload.userId;
              }
            } catch {
              // Invalid intent is never accepted as account-linking authorization.
            }
          }
        }
      }

      if (linkingUserId) {
        const linkedElsewhere = await db.user.findUnique({ where: { linkedinId } });
        if (linkedElsewhere && linkedElsewhere.id !== linkingUserId) {
          return "/onboarding/connect-linkedin?error=already-linked";
        }
        const owner = await db.user.findUnique({ where: { id: linkingUserId } });
        if (!owner) return false;
        if (owner.linkedinId && owner.linkedinId !== linkedinId) {
          return "/onboarding/connect-linkedin?error=already-linked";
        }
        const appUser = await db.user.update({
          where: { id: owner.id },
          data: {
            linkedinId,
            linkedinName: user.name ?? null,
            linkedinProfileUrl:
              (user as { linkedinProfileUrl?: string | null }).linkedinProfileUrl ?? null,
            identityLockedAt: owner.phoneVerified
              ? (owner.identityLockedAt ?? new Date())
              : owner.identityLockedAt,
          },
        });
        user.id = appUser.id;
        (user as typeof user & { role: string; identityLockedAt: string | null }).role = appUser.role;
        (user as typeof user & { identityLockedAt: string | null }).identityLockedAt =
          appUser.identityLockedAt?.toISOString() ?? null;
        return true;
      }

      // A signed, short-lived intent distinguishes login from registration.
      const modeCookie = (await cookies()).get("ojp_linkedin_mode")?.value;
      let mode: "login" | "signup" | null = null;
      if (modeCookie && process.env.NEXTAUTH_SECRET) {
        const [encoded, signature] = modeCookie.split(".");
        if (encoded && signature) {
          const expected = crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET)
            .update(encoded).digest("hex");
          if (signature.length === expected.length &&
              crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            try {
              const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
                mode?: string; expires?: number; nonce?: string;
              };
              if (payload.expires && payload.expires > Date.now() &&
                  (payload.mode === "login" || payload.mode === "signup")) {
                if (await consumeOAuthIntent("mode", payload.nonce)) mode = payload.mode;
              }
            } catch {
              // Reject malformed intent.
            }
          }
        }
      }
      if (!mode) return "/login?error=LinkedInIntentExpired";

      let appUser = await db.user.findUnique({ where: { linkedinId } });
      if (appUser) {
        if (mode === "signup") return "/login?error=AccountExists";
        // Never allow a previously linked identity to silently switch email accounts.
        if (appUser.email.toLowerCase() !== email) return false;
      } else {
        if (mode === "login") return "/login?error=LinkedInNotRegistered";
        // Existing password accounts must use an authenticated, explicit linking flow.
        const emailOwner = await db.user.findUnique({ where: { email } });
        if (emailOwner) return "/login?error=AccountNotLinked";

        // LinkedIn-first signup: persist a real application user and profile.
        // Unique constraints on email and linkedinId protect concurrent signups.
        const fullName = user.name?.trim() || email.split("@")[0] || email;
        let customerId: string | null = null;
        try {
          const customer = await stripe.customers.create({
            email, name: fullName, metadata: { source: "openjobpulse", provider: "linkedin" },
          });
          customerId = customer.id;
          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: process.env.STRIPE_PRICE_MONTHLY! }],
            trial_period_days: 7,
            payment_behavior: "default_incomplete",
          });
          if (!subscription.trial_end) throw new Error("Stripe trial end missing");
          const trialEnd = new Date(subscription.trial_end * 1000);
          appUser = await db.$transaction(async tx => {
            const newUser = await tx.user.create({
              data: {
                email, linkedinId, linkedinName: user.name ?? null,
                linkedinProfileUrl: (user as { linkedinProfileUrl?: string | null }).linkedinProfileUrl ?? null,
                profile: { create: { fullName, creditBalance: 50, creditsLifetime: 50 } },
              },
            });
            await tx.subscription.create({
              data: {
                userId: newUser.id, stripeCustomerId: customer.id,
                stripeSubscriptionId: subscription.id, status: "TRIALING",
                trialEnd, currentPeriodStart: new Date(), currentPeriodEnd: trialEnd,
              },
            });
            await tx.creditTransaction.create({
              data: {
                userId: newUser.id, type: "TRIAL_GRANT", amount: 50,
                balance: 50, description: "7-day trial credit grant",
              },
            });
            const workspace = await tx.workspace.create({
              data: { name: fullName + "'s Workspace", slug: newUser.id + "-workspace" },
            });
            await tx.workspaceMember.create({
              data: { workspaceId: workspace.id, userId: newUser.id, role: "owner" },
            });
            return newUser;
          });
        } catch (error) {
          if (customerId) {
            try { await stripe.customers.del(customerId); }
            catch (cleanupError) { console.error("LinkedIn signup Stripe cleanup failed", cleanupError); }
          }
          console.error("LinkedIn signup provisioning failed", error);
          return "/register?error=ProvisioningFailed";
        }
      }

      // NextAuth's provider ID is not the application's Prisma user ID.
      user.id = appUser.id;
      (user as typeof user & { role: string; identityLockedAt: string | null }).role = appUser.role;
      (user as typeof user & { identityLockedAt: string | null }).identityLockedAt =
        appUser.identityLockedAt?.toISOString() ?? null;
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = (user as { role?: string }).role ?? "USER";
        token.identityLockedAt =
          (user as { identityLockedAt?: string | null }).identityLockedAt ?? null;
      }
      // Phone verification happens after sign-in. Read its updated status
      // rather than keeping a stale onboarding state in the JWT.
      if (token.id) {
        const current = await db.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, identityLockedAt: true, linkedinId: true, passwordHash: true },
        });
        if (!current) { token.id = ""; return token; }
        const passwordFingerprint = crypto.createHash("sha256").update(current.passwordHash ?? "").digest("hex");
        if (!user && token.passwordFingerprint !== passwordFingerprint) {
          token.id = "";
          return token;
        }
        token.passwordFingerprint = passwordFingerprint;
        token.role = current.role;
        token.identityLockedAt = current.identityLockedAt?.toISOString() ?? null;
        token.linkedinId = current.linkedinId;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.identityLockedAt = token.identityLockedAt as string | null;
      (session.user as typeof session.user & { linkedinId?: string | null }).linkedinId =
        (token.linkedinId as string | null) ?? null;
      return session;
    },
  },
};