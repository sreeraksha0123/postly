# syntax=docker/dockerfile:1
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
