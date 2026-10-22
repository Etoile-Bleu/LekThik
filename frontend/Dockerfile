FROM node:22-slim AS development-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN corepack enable && corepack prepare pnpm@11 --activate
RUN pnpm install
COPY . .

FROM development-dependencies-env AS build-env
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

FROM node:22-slim AS production
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable && corepack prepare pnpm@11 --activate
COPY --from=build-env /app/dist ./dist
RUN pnpm add -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
