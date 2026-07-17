# Multi-Vendor Fashion Marketplace

Turborepo monorepo: customer & seller apps (React Native/Expo), storefront (Next.js),
admin (React), and API (NestJS). PostgreSQL, Redis, Meilisearch, MinIO.

## Develop

docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm dev

## Layout

apps/ api · web · (customer-app, seller-app, admin to come)
packages/ types · constants · ui-mobile · config
infra/ docker-compose + nginx
docs/ ADRs, implementation plan, design system
