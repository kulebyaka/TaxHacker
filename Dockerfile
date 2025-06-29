# Builder stage
FROM node:23-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
# We also need prisma client
COPY prisma ./prisma/
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:23-alpine AS runner

WORKDIR /app

# Install production dependencies
RUN apk --no-cache add \
    ca-certificates \
    ghostscript \
    graphicsmagick \
    postgresql-client

ENV NODE_ENV=production
ENV PORT=7331

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output from the builder stage
COPY --from=builder /app/.next/standalone ./
# Copy prisma schema
COPY --from=builder /app/prisma ./prisma
# Copy the public and static assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh

# Create upload directory and set permissions
RUN mkdir -p /app/upload
RUN chown -R nextjs:nodejs /app

# Switch to the non-root user
USER nextjs

EXPOSE 7331

# Set the entrypoint to run the Next.js server
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
