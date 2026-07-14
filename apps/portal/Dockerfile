FROM node:26-alpine AS build

WORKDIR /app
RUN npm install --global pnpm@11.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @owbastion/portal build

FROM node:26-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/apps/portal/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
