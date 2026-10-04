FROM node:22-slim

# Install poppler-utils (provides pdftoppm for PDF-to-image conversion used in AI extraction)
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# COPY . . before install so patches/ directory is available (pnpm patchedDependencies)
COPY . .
RUN npm install -g corepack@latest && corepack pnpm install && corepack pnpm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
