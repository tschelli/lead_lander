FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config-schema/package.json packages/config-schema/package.json

RUN npm install

COPY . .
RUN npm --workspace packages/config-schema run build
RUN npm --workspace apps/worker run build

EXPOSE 5005
CMD ["node", "apps/worker/dist/worker.js"]
