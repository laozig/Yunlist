# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS backend-deps
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

FROM node:22-bookworm-slim AS backend-prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS backend-build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
COPY --from=backend-deps /app/node_modules ./node_modules
RUN npm run build

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=backend-prod-deps /app/node_modules ./node_modules
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY .env.example ./.env.example

EXPOSE 3000

CMD ["node", "dist/index.js"]