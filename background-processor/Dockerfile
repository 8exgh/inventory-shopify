# Stage 1: Builder
FROM node:20 AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Create data directory (will be mounted as volume)
RUN mkdir -p /data

# Set environment variables with defaults
ENV NODE_ENV=production
ENV HOST=localhost
ENV PORT=3000
ENV DATA_DIR=/data
ENV POLLING_INTERVAL_MS=5000
# No exposed ports needed (background processor)

# Start background processor
CMD ["node", "dist/background/processor.js"]
