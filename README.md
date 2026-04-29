# E-commerce Microsserviços

E-commerce moderno B2C de moda construído como **monorepo poliglota** (Java/Spring Boot, Node/TypeScript/NestJS, Go) com fins reais e educacionais — foco em microsserviços, DevOps e segurança com mentalidade de pentest. Hospedado em VPS única da Hostinger (staging + prod isolados), com Cloudflare na borda, Traefik como reverse proxy, Kafka para eventos, observabilidade completa via Grafana LGTM e CI/CD com GitHub Actions + release-please.

## Documentos principais

- [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) — visão consolidada (escopo, arquitetura, stack, plano faseado)
- [`docs/backlog/phase-0.md`](docs/backlog/phase-0.md) — backlog da fase atual
- [`LICENSE`](LICENSE) — MIT

## Status

🚧 **Fase 0 — Bootstrap.** Plataforma observável, desplegável, com release automático antes de qualquer feature de e-commerce.

## Estrutura

```
services/    # microsserviços (Java, Node, Go)
contracts/   # OpenAPI + Protobuf (fonte da verdade)
frontend/    # Next.js storefront e admin
infra/       # Ansible, OpenTofu, Docker Compose, Helm/k8s
libs/        # libs internas compartilhadas
tools/       # scripts auxiliares
docs/        # ADRs, runbooks, compliance, fases
```
