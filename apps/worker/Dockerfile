FROM node:20-slim AS base

# Install system deps for native modules
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy package manifests
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/
COPY packages/ai/package.json ./packages/ai/
COPY packages/embeddings/package.json ./packages/embeddings/
COPY apps/worker/package.json ./apps/worker/

# Install all workspace dependencies
RUN npm ci --workspace=apps/worker \
           --workspace=packages/db \
           --workspace=packages/queue \
           --workspace=packages/ai \
           --workspace=packages/embeddings

# Copy source code
COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY packages/ai ./packages/ai
COPY packages/embeddings ./packages/embeddings
COPY apps/worker ./apps/worker

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Build worker
RUN cd apps/worker && npx tsc

# Runtime stage
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y \
  curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts + node_modules
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/worker/dist ./apps/worker/dist
COPY --from=base /app/apps/worker/package.json ./apps/worker/

# Model cache directory for ONNX
RUN mkdir -p .model_cache

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]