# Architecture Decision Records (ADRs)

Registro atômico das decisões arquiteturais deste projeto. Cada ADR documenta
**uma decisão** com seu contexto, alternativas consideradas e consequências.

> **Antes de criar uma ADR:** leia `CLAUDE.md` §"ADRs — leia antes de decidir
> algo arquitetural" e `ADR-0000` (meta-processo). Use `template.md` como base.

## Política em uma frase

**ADR nasce no PR da tarefa que toma a decisão.** O arquivo da ADR aparece no
diff junto com o código que a implementa. Lote inicial (ADRs 0000-0004) é
exceção controlada — registra decisões já em uso desde o primeiro commit.

## Convenções rápidas

- **Numeração:** sequencial, 4 dígitos zero-padded (`ADR-0001`).
- **Nome do arquivo:** `ADR-XXXX-kebab-case-titulo.md`.
- **Status:** `accepted` (default), `proposed`, `deprecated`, `superseded by ADR-YYYY`.
- **Imutabilidade:** ADRs `accepted` não são editadas retroativamente.
  Mudou de ideia? Nova ADR com `Supersedes: ADR-XXXX`.
- **Linguagem:** PT-BR.
- **Citação em commits:** footer `Refs: ADR-XXXX, ...`.

## Índice

| ADR                                                                     | Título                                                                | Status   | Data       | Tags                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- | ---------- | ----------------------------------- |
| [0000](ADR-0000-como-usamos-adrs.md)                                    | Como usamos ADRs neste projeto                                        | accepted | 2026-04-29 | meta, processo, documentação        |
| [0001](ADR-0001-monorepo-unico-poliglota.md)                            | Adotar monorepo único poliglota                                       | accepted | 2026-04-29 | repo, estrutura, ci-cd, contracts   |
| [0002](ADR-0002-conventional-commits-com-scope-obrigatorio.md)          | Conventional Commits com scope obrigatório e body-required-when-typed | accepted | 2026-04-29 | repo, ci, processo, contributing    |
| [0003](ADR-0003-trunk-based-development-com-squash-merge.md)            | Trunk-based development com squash merge                              | accepted | 2026-04-29 | repo, ci-cd, processo, contributing |
| [0004](ADR-0004-versionamento-independente-com-release-please.md)       | Versionamento independente por serviço com release-please             | accepted | 2026-04-29 | ci-cd, release, repo, contributing  |
| [0005](ADR-0005-protecao-main-via-hook-local-em-github-free-privado.md) | Proteção da branch `main` via hook local em GitHub Free privado       | accepted | 2026-04-30 | repo, ci-cd, security, contributing |

## ADRs candidatas (a nascerem nas tarefas correspondentes)

Lista viva de decisões grandes do `PROJECT_BRIEF.md` que ainda não têm ADR.
Cada uma deve ser **criada no PR da tarefa indicada** — não em lote, salvo
mudança de política. Atualizar conforme novas tarefas forem identificadas.

> O número da ADR só é fixado **no momento da criação** (próximo número
> disponível). Os números abaixo são apenas indicativos da ordem provável.

### Fase 0 — Bootstrap

| ADR (provável) | Decisão                                                                                         | Refs do brief | Tarefa do backlog         |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------- | ------------------------- |
| 0006           | VPS Hostinger única para staging + prod com isolamento via Docker networks                      | §5.4          | P0-C1 a P0-C5             |
| 0007           | Ansible para configuração de VPS + OpenTofu para Cloudflare                                     | §5.5          | P0-C2, P0-D1              |
| 0008           | Cloudflare proxied + Traefik + Let's Encrypt + mTLS origin (Authenticated Origin Pulls)         | §7.2          | P0-D2 a P0-D4             |
| 0009           | Linguagem do hello-service                                                                      | §9, P0-E1     | **P0-E1 (DoD da tarefa)** |
| 0010           | Stack de observabilidade Grafana LGTM + OpenTelemetry                                           | §6.1          | P0-G1                     |
| 0011           | DevSecOps stack: Semgrep + Trivy + gitleaks + Checkov + SonarCloud (cosign + SBOM desde Fase 1) | §6.3 + nota   | P0-H2 a P0-H5, P0-A5      |
| 0012           | Renovate para gestão de dependências                                                            | §6.3          | P0-H4                     |

### Fase 1 — MVP vertical slice

| ADR (provável) | Decisão                                                                                             | Refs do brief |
| -------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| —              | Estratégia bi/triglota deliberada (Java + Node + Go) e mapa serviço → linguagem                     | §3.1          |
| —              | Database per service + polyglot persistence pragmática                                              | §2.4          |
| —              | Apache Kafka (KRaft, sem Zookeeper) + Redpanda em dev/staging                                       | §3.2          |
| —              | Contratos: OpenAPI (REST) + Protobuf (eventos) + buf + Schema Registry                              | §3.3          |
| —              | API Gateway/BFF: Go monolítico em Fase 1, Kong+BFF na Fase 2                                        | §3.4          |
| —              | Comunicação inter-serviços: REST síncrono + eventos assíncronos + saga orquestrada + outbox pattern | §2.3          |
| —              | Keycloak como IdP com 2 realms (customers, staff)                                                   | §7.1          |
| —              | JWT RS256 com refresh rotation e reuse detection; access token 5min staff / 15min customers         | §7.1          |
| —              | Stripe como gateway de pagamento + abstração `PaymentProvider`                                      | §7.4          |
| —              | PCI-SAQ A via Stripe Elements (PAN/CVV nunca toca o sistema)                                        | §7.3          |
| —              | Frontend: Next.js + shadcn/ui + Tailwind + TanStack Query + openapi-fetch                           | §8.1          |
| —              | CSP estrita com nonce dinâmico no Next                                                              | §8.1          |
| —              | Estratégia de testes: pirâmide moderna + Testcontainers + Pact                                      | §6.2          |

### Fase 2+ — Robustez e DevOps avançado

| ADR (provável) | Decisão                                                                 | Refs do brief |
| -------------- | ----------------------------------------------------------------------- | ------------- |
| —              | k3s single-node na mesma VPS + migração Strangler-style                 | §5.4          |
| —              | GitOps com ArgoCD observando `infra/k8s/`                               | §5.3          |
| —              | Argo Rollouts: Blue/Green em payment-service, Canary em catalog-service | §5.6          |
| —              | Sealed Secrets → ESO + Vault (faseado)                                  | §5.7          |
| —              | mTLS interno via cert-manager + CA interna                              | §7.1          |
| —              | Coraza WAF no Traefik + DAST (ZAP/Nuclei) em staging                    | §7.2          |

> Esta lista **não é exaustiva** — é um índice das decisões que já temos no
> brief e cuja obrigação de virar ADR está clara. Decisões novas que surjam
> durante a execução também viram ADR (regra default: junto com o PR da tarefa).
