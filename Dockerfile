# VeeFore Production Dockerfile
# Multi-stage build for optimized production deployment

# ==========================================
# Build Stage
# ==========================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies) for build
# Production pruning happens in the production stage
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build application
RUN NODE_ENV=production npm run build

# ==========================================
# Production Stage
# ==========================================
FROM node:18-alpine AS production

# Security hardening
RUN addgroup -g 1001 -S nodejs && \
    adduser -S veefore -u 1001

# Install runtime dependencies
RUN apk add --no-cache curl dumb-init

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=veefore:nodejs /app/dist ./dist
COPY --from=builder --chown=veefore:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=veefore:nodejs /app/package.json ./

# Create necessary directories
RUN mkdir -p uploads logs && \
    chown -R veefore:nodejs uploads logs

# Create production environment template
RUN echo "NODE_ENV=production" > .env.template && \
    echo "PORT=5000" >> .env.template && \
    echo "DATABASE_URL=mongodb://localhost:27017/veefore" >> .env.template && \
    chown veefore:nodejs .env.template

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Switch to non-root user
USER veefore

# Expose port
EXPOSE 5000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]

# ==========================================
# Metadata
# ==========================================
LABEL name="veefore" \
      version="1.0.0" \
      description="VeeFore - AI-Powered Social Media Management Platform" \
      maintainer="VeeFore Team" \
      org.opencontainers.image.source="https://github.com/your-org/veefore"