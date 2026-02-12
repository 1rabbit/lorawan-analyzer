FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY docs ./docs

# Install dev dependencies for build, then build, then remove dev deps
RUN npm install && npm run build && npm prune --production

# Run
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
