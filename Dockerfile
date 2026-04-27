FROM node:18-alpine

RUN apk add --no-cache openssl python3 make g++ libc6-compat

WORKDIR /app

COPY package*.json ./

RUN npm install --production=false

COPY prisma ./prisma

RUN npx prisma generate

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]