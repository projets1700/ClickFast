# --- Étape 1 : installation des seules dépendances de production ---
FROM node:24.22.1-alpine AS deps
WORKDIR /app

# Dépendances avant le code : cette couche reste en cache tant que package*.json ne bouge pas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Étape 2 : image finale, sans npm cache ni dépendances de dev ---
FROM node:24.22.1-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

EXPOSE 3000

# L'image node fournit déjà l'utilisateur non privilégié "node"
USER node

# Forme exec : node est PID 1 et reçoit SIGTERM au docker stop
CMD ["node", "src/server.js"]
