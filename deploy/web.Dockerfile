FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.4.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web apps/web
COPY apps/miniprogram apps/miniprogram
COPY apps/electron/package.json apps/electron/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile
ARG VITE_PUBLIC_LOGIN_USERNAME
RUN --mount=type=secret,id=public_login_password \
    export VITE_PUBLIC_LOGIN_USERNAME="$VITE_PUBLIC_LOGIN_USERNAME" && \
    export VITE_PUBLIC_LOGIN_PASSWORD="$(cat /run/secrets/public_login_password 2>/dev/null || true)" && \
    pnpm build && pnpm --filter @industrial/miniprogram build:h5

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

COPY --from=build /app/apps/miniprogram/dist/build/h5 /srv/mobile
