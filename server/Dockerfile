# Image du site 6AM (vitrine + QG). Construite par server/deploy/docker-compose.yml
FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . /app
RUN mkdir -p /app/uploads && chown node:node /app/uploads
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/app/uploads
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/index.js"]
