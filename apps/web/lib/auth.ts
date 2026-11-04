import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import LinkedInProvider from "next-auth/providers/linkedin";
import { db } from "@ojp/db";
import { verify } from "argon2";
import crypto from "crypto";

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
      if (account?.provider === "linkedin") {
        const linkedinId = account.providerAccountId;

        // Check blocked identities
        const blocked = await db.blockedIdentity.findUnique({
          where: { linkedinId },
        });
        if (blocked) return "/register?error=blocked";

        // Check if LinkedIn already linked to different account
        const existing = await db.user.findUnique({
          where: { linkedinId },
        });

        if (!existing) {
          // New LinkedIn user — check email isn't already registered
          const emailExists = await db.user.findUnique({
            where: { email: user.email! },
          });
          const emailHash = crypto
            .createHash("sha256")
            .update(user.email!.toLowerCase())
            .digest("hex");
          const emailBlocked = await db.blockedIdentity.findUnique({
            where: { emailHash },
          });
          if (emailExists || emailBlocked) return "/register?error=blocked";
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.identityLockedAt = (user as any).identityLockedAt;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.identityLockedAt = token.identityLockedAt as string | null;
      return session;
    },
  },
};