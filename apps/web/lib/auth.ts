import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import LinkedInProvider from "next-auth/providers/linkedin";
import { db } from "@ojp/db";
import { verify } from "argon2";
import crypto from "crypto";

export function createAuthOptions(linkingUserId?: string): NextAuthOptions {
return {
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

      let appUser = await db.user.findUnique({ where: { linkedinId } });
      if (linkingUserId) {
        const target = await db.user.findUnique({ where: { id: linkingUserId } });
        if (!target || (appUser && appUser.id !== target.id)) return false;
        if (target.linkedinId && target.linkedinId !== linkedinId) return false;
        const updated = await db.user.updateMany({
          where: { id: target.id, OR: [{ linkedinId: null }, { linkedinId }] },
          data: {
            linkedinId,
            linkedinName: user.name ?? null,
            linkedinProfileUrl: (user as { linkedinProfileUrl?: string | null }).linkedinProfileUrl ?? null,
          },
        });
        if (updated.count !== 1) return false;
        appUser = await db.user.findUnique({ where: { id: target.id } });
        if (!appUser) return false;
        user.id = appUser.id;
        (user as typeof user & { role: string; identityLockedAt: string | null }).role = appUser.role;
        (user as typeof user & { identityLockedAt: string | null }).identityLockedAt =
          appUser.identityLockedAt?.toISOString() ?? null;
        return true;
      }
      if (appUser) {
        // Never allow a previously linked identity to silently switch email accounts.
        if (appUser.email.toLowerCase() !== email) return false;
      } else {
        // Existing password accounts must use an authenticated, explicit linking flow.
        const emailOwner = await db.user.findUnique({ where: { email } });
        if (emailOwner) return "/register?error=blocked";

        // LinkedIn-first signup: persist a real application user and profile.
        // Unique constraints on email and linkedinId protect concurrent signups.
        appUser = await db.user.create({
          data: {
            email,
            linkedinId,
            linkedinName: user.name ?? null,
            linkedinProfileUrl: (user as { linkedinProfileUrl?: string | null }).linkedinProfileUrl ?? null,
            profile: {
              create: { fullName: user.name?.trim() || email.split("@")[0] },
            },
          },
        });
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
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
        token.identityLockedAt =
          (user as { identityLockedAt?: string | null }).identityLockedAt ?? null;
      }
      // Phone verification happens after sign-in. Read its updated status
      // rather than keeping a stale onboarding state in the JWT.
      if (token.id) {
        const current = await db.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, identityLockedAt: true, linkedinId: true },
        });
        if (!current) return { ...token, id: undefined };
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
}

export const authOptions: NextAuthOptions = createAuthOptions();
