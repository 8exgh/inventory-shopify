# Stage 1: Builder
FROM node:20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . ./

# Build Next.js app (creates .next directory)
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy Next.js build output from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./

# Copy font files (referenced in layout)
COPY --from=builder /app/src/app/fonts ./src/app/fonts

# Set environment variables with defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Expose frontend port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Start Next.js server
CMD ["npm", "start"]
