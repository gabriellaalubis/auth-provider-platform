FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

RUN AUTH_DATABASE_URL=mysql://unused:unused@localhost:3306/auth_db \
    APP_A_DATABASE_URL=mysql://unused:unused@localhost:3306/app_a_db \
    APP_B_DATABASE_URL=mysql://unused:unused@localhost:3306/app_b_db \
    pnpm run db:generate && pnpm exec nest build "${APP_NAME}"

CMD ["sh", "-c", "node dist/apps/${APP_NAME}/main.js"]
