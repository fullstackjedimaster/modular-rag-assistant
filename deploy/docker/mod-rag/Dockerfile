# mod-rag/deploy/docker/mod-rag/Dockerfile

FROM node:22-alpine AS deps
WORKDIR /app

# If you have package-lock.json, this is reproducible.
COPY ./mod-rag/package.json ./mod-rag/package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY ./mod-rag ./

ARG NEXT_PUBLIC_AI_RAG_API_BASE
ENV NEXT_PUBLIC_AI_RAG_API_BASE=${NEXT_PUBLIC_AI_RAG_API_BASE}

ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3003

# keep only what you need at runtime
COPY --from=builder /app ./

EXPOSE 3003
CMD ["npm","run","start"]
