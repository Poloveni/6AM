# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app

# Dependances (couche mise en cache tant que package*.json ne change pas)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Code applicatif
COPY . .

# Utilisateur non-root
RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app \
 && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
