FROM node:22.22.3-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json backend/
RUN npm ci --prefix backend
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend

COPY backend/tsconfig.json backend/
COPY backend/src backend/src
COPY frontend/index.html frontend/
COPY frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/
COPY frontend/src frontend/src
COPY schemas schemas
COPY shared shared

RUN npm run build --prefix backend
RUN npm run build --prefix frontend
RUN npm prune --omit=dev --prefix backend

FROM node:22.22.3-bookworm-slim

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002
ENV DATA_ROOT=/data
ENV DB_PATH=/data/gta-v.db
ENV STATIC_ROOT=/app/frontend/dist
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist /app/frontend/dist

USER node
EXPOSE 3002
CMD ["node", "dist/backend/src/index.js"]
