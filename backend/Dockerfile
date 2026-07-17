FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/index.js"]
