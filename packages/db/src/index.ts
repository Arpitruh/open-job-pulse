import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Workspace RLS middleware
// Sets app.current_workspace_id per transaction for PostgreSQL RLS policies
db.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<unknown>) => {
  const workspaceId = (globalThis as any).__currentWorkspaceId;
  if (workspaceId) {
    await db.$executeRaw`SELECT set_config('app.current_workspace_id', ${workspaceId}, true)`;
  }
  return next(params);
});

export * from "@prisma/client";