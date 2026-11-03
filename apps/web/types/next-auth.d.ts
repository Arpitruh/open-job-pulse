import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      identityLockedAt: string | null;
      linkedinId?: string | null;
    };
  }

  interface User {
    id: string;
    role: string;
    identityLockedAt: string | null;
    linkedinId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    identityLockedAt: string | null;
    linkedinId?: string | null;
  }
}