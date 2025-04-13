# syntax=docker/dockerfile:1

# Stage 1: Build Stage
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application files
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# Build the application
RUN npm run build

# Stage 2: Production Stage
FROM node:20-slim AS production

# Set working directory
WORKDIR /app

# Copy built application and dependencies from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY package.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
# Set Redis connection for Docker environment
ENV KV_REST_API_URL=redis://redis:6379
ENV KV_REST_API_TOKEN=mock

# Expose the application port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]
