# ═══════════════════════════════════════════════
# Radient — Docker build for Railway
# ═══════════════════════════════════════════════

FROM node:20

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++

# Install root dependencies (including better-sqlite3 native build)
# We must copy jiosaavn-api-local FIRST because the root package.json's postinstall script tries to cd into it
COPY package.json package-lock.json ./
COPY jiosaavn-api-local/ ./jiosaavn-api-local/
RUN npm ci

# Copy all source
COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./

EXPOSE 3000

CMD ["npx", "tsx", "src/bootstrap.ts"]
