FROM node:18-alpine

# Required for Prisma binary compatibility
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm install --production=false

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy application source
COPY src ./src

# Expose port
EXPOSE 3000

# Start command — Railway overrides this with railway.json startCommand
# but this is the fallback
CMD ["node", "src/index.js"]
