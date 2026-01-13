# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies for SQLite
RUN apk add --no-cache sqlite

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy static files (config page)
COPY --from=builder /app/static ./static

EXPOSE 7000

# Create volume mount point for database persistence
VOLUME /app/data
ENV DB_PATH=/app/data/ultrathink.db

CMD ["node", "dist/index.js"]
