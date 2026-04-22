FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build TypeScript
RUN bun run build

# ─── Production image ───
FROM oven/bun:1-slim

WORKDIR /app

# Copy built output + dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Default environment
ENV NODE_ENV=production
ENV MCP_TRANSPORT=streamable_http
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/index.js"]
