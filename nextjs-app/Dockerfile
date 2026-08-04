# Stage 1: Builder
FROM node:20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . ./

# Build metadata, available while prerendering static pages
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME

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
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/scripts ./scripts
# COPY --from=builder /app/public ./public

# Create data directory (will be mounted as volume)
RUN mkdir -p /data

# Set environment variables with defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Build metadata, for pages rendered at request time
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME

# Expose backend port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Apply system-db migrations, then start Next.js server
CMD ["sh", "-c", "node scripts/migrate-system-db.js && npm start"]