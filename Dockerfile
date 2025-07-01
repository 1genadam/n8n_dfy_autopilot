# Multi-stage build for n8n DFY Autopilot production deployment
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies required for video processing and browser automation
RUN apk add --no-cache \
    ffmpeg \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++

# Configure Chromium for Playwright
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package files
COPY package*.json ./

# Install dependencies with production optimizations
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM base AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S autopilot -u 1001

# Create directories with proper permissions
RUN mkdir -p /app/uploads /app/temp /app/logs && \
    chown -R autopilot:nodejs /app

# Copy application code
COPY --chown=autopilot:nodejs . .

# Create volume mount points
VOLUME ["/app/uploads", "/app/temp"]

# Switch to non-root user
USER autopilot

# Expose the port
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 8080, path: '/health', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

# Start the application
CMD ["npm", "start"]