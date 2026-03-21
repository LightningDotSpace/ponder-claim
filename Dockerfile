FROM node:20-alpine

ARG COMMIT_HASH=public
ENV COMMIT_HASH=${COMMIT_HASH}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 42069

# Run offchain migrations, then start ponder
CMD ["sh", "-c", "npm run offchain:migrate && npx ponder start --schema schema-${COMMIT_HASH}"]