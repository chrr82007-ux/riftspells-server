FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Install TypeScript for building
RUN npm install typescript

# Build TypeScript
RUN npx tsc

# Expose port
EXPOSE 2567

# Start the server
CMD ["node", "dist/index.js"]
