# ═══════════════════════════════════════════════
# Radient — Multi-stage Docker build
# Self-hosted music streaming PWA
# ═══════════════════════════════════════════════

FROM node:20-slim AS base
WORKDIR /app

# Install dependencies for both root and jiosaavn-api-local
COPY package.json package-lock.json ./
COPY jiosaavn-api-local/package.json jiosaavn-api-local/package-lock.json ./jiosaavn-api-local/
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/
COPY public/ ./public/
COPY jiosaavn-api-local/ ./jiosaavn-api-local/
COPY tsconfig.json ./

# Install jiosaavn-api-local dev dependencies for build
RUN cd jiosaavn-api-local && npm ci

EXPOSE 3000

# Start the app via tsx (runtime TypeScript execution)
CMD ["npx", "tsx", "src/bootstrap.ts"]
