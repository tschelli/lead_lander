FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config-schema/package.json packages/config-schema/package.json

RUN npm install

COPY . .
RUN npm --workspace packages/config-schema run build
RUN npm --workspace apps/api run build

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
