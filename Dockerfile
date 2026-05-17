# ═══════════════════════════════════════════════
# Radient — Docker build for Railway
# ═══════════════════════════════════════════════

FROM node:20

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++

# Install root dependencies (including better-sqlite3 native build)
COPY package.json package-lock.json ./
RUN npm ci

# Install JioSaavn sub-project dependencies
COPY jiosaavn-api-local/package.json jiosaavn-api-local/package-lock.json ./jiosaavn-api-local/
RUN cd jiosaavn-api-local && npm ci --ignore-scripts

# Copy all source
COPY src/ ./src/
COPY public/ ./public/
COPY jiosaavn-api-local/ ./jiosaavn-api-local/
COPY tsconfig.json ./

EXPOSE 3000

CMD ["npx", "tsx", "src/bootstrap.ts"]
