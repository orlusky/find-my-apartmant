FROM node:22-slim

# Required for Playwright's --with-deps installer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all deps (including devDeps for TypeScript build)
COPY package*.json ./
RUN npm ci

# Install Chromium + all its system dependencies
RUN npx playwright install --with-deps chromium

# Copy source and compile
COPY . .
RUN npm run build

# Remove devDeps after build
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
