# Convenções de commit

> Seguimos **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)** com:
> - **scope obrigatório** (lista enumerada)
> - **body obrigatório** para `feat` / `fix` / `refactor` / `perf` e qualquer commit `!` (breaking)
>
> Validado localmente via `husky` + `commitlint`; também rodado no CI.
> Referências primárias: [`CLAUDE.md`](../../CLAUDE.md) (política de redação para LLM-collaboration), [`PROJECT_BRIEF.md` §5.1](../../PROJECT_BRIEF.md).
>
> **Por que body obrigatório:** dev solo + Claude Code → o `git log` é o memorando institucional consumido por sessões futuras. Mensagens sem WHY = decisão arqueológica amanhã.

## Formato

```
<type>(<scope>): <subject>

<WHY: 1-3 frases — qual problema, qual restrição, qual decisão>

[opcional] <NON-OBVIOUS / GOTCHAS — invariante, ordem, edge case>
[opcional] <REJECTED ALTERNATIVES — o que foi descartado e por quê>
[opcional] <VERIFIED — comando ou observação que comprova>

[opcional] Refs: ADR-XXXX, PROJECT_BRIEF.md §X, docs/runbooks/Y.md
[opcional] Closes: #N
[opcional] BREAKING CHANGE: <descrição>

Co-Authored-By: <modelo> <noreply@anthropic.com>
```

**Type** identifica a *natureza* da mudança. **Scope** identifica *onde* — o serviço ou área afetada. **Subject** descreve *o quê* em uma linha curta. **Body** explica *o porquê*.

### Regras de redação rápidas

1. Subject ≤ 72 chars, imperativo (`add`, não `added`).
2. Body explica WHY, **não redescreve o diff**.
3. Body com no máximo 100 chars por linha; mínimo 50 chars total quando obrigatório.
4. Cite âncoras concretas: ADR, brief §X, caminho de arquivo.
5. Mencione alternativas rejeitadas quando relevante.
6. Sem emojis, sem rodapés promocionais.

## Types permitidos

| Type | Quando usar |
|------|-------------|
| `feat` | Nova feature visível ao usuário ou consumidor da API |
| `fix` | Correção de bug |
| `refactor` | Mudança de código sem alterar comportamento externo |
| `perf` | Otimização de performance |
| `test` | Adição/ajuste de testes (sem mudar código de produção) |
| `docs` | Documentação (README, ADR, runbook, brief) |
| `chore` | Manutenção, deps, configs, sem impacto direto em runtime |
| `ci` | Mudanças em workflows do GitHub Actions / CI |
| `build` | Mudanças em build system (Maven, Gradle, Dockerfile, etc.) |
| `style` | Formatação, semicolons, lint auto-fix |
| `revert` | Reverter commit anterior |

Breaking change: sufixo `!` no type/scope **e** rodapé `BREAKING CHANGE:` no body.

## Scopes permitidos

A lista é curada em [`commitlint.config.js`](../../commitlint.config.js). Adicione um novo scope quando criar um serviço ou área nova.

**Serviços:**
- `hello-service` (Fase 0)
- (futuros: `order-service`, `payment-service`, `inventory-service`, `checkout-service`, `identity-service`, `catalog-service`, `cart-service`, `customer-service`, `pricing-service`, `shipping-service`, `review-service`, `notification-service`, `search-service`, `api-gateway`)

**Áreas do monorepo:**
- `repo` — configs de raiz (`.gitignore`, `README.md`, `LICENSE`, etc.)
- `deps` — bumps de dependência que afetam múltiplos workspaces
- `ci` — workflows do GitHub Actions, ferramentas de CI
- `docs` — documentação, ADRs, runbooks, brief
- `infra` — Ansible, OpenTofu, Docker Compose, k8s/Helm, Traefik
- `contracts` — `contracts/proto`, `contracts/openapi`
- `frontend` — `frontend/web`, `frontend/admin`, `frontend/shared`
- `observability` — OTel Collector, Prometheus, Loki, Tempo, Grafana
- `security` — `SECURITY.md`, hardening, threat model
- `release` — bookkeeping do release-please

## Exemplos válidos

### `feat` com body informativo

```
feat(hello-service): expose /version endpoint with build metadata

Production diagnostics need to know which build is running without
SSHing into the VPS. /version returns service name, semver, commit
SHA and build timestamp injected at image build time.

Picked env vars over baking values into the JAR because the same
image is reused across environments — values come from the deploy.

Refs: PROJECT_BRIEF.md §5.1, docs/backlog/phase-0.md P0-E2
Verified: docker run … && curl :8080/version
```

### `fix` apontando regressão e gotcha

```
fix(payment-service): treat idempotency keys as case-insensitive

A duplicate-detection bug surfaced when iOS sent uppercase UUIDs
and Android sent lowercase. The dedup table compared bytes, so the
same logical request produced two charges.

Normalize to lowercase at the gateway. The DB column is unchanged
(still UUID), but writes go through the normalizer.

Refs: docs/runbooks/payment-incidents.md#2026-04-29
Verified: pnpm test --filter payment-service
```

### `chore` trivial — body não obrigatório

```
chore(deps): bump axios from 1.7.0 to 1.7.4
```

```
docs(repo): fix typo in commits.md
```

```
ci(repo): pin actions/checkout to v4.1.7
```

### `refactor` breaking — body obrigatório

```
refactor(catalog-service)!: drop legacyCode field

The legacyCode field was a transitional alias from the previous
ERP migration (2025-Q4). Last consumer (admin export) cut over
two releases ago.

BREAKING CHANGE: clients must read externalId. Bumps major.
Refs: ADR-0011-catalog-id-strategy.md
```

### `chore` com decisão (body recomendado mesmo sem enforce)

```
chore(infra): switch Traefik resolver from HTTP-01 to TLS-ALPN

HTTP-01 required port 80 open for renewal, conflicting with the
mTLS lockdown of Cloudflare AOP. TLS-ALPN renews via 443, which
already terminates client certs.

Refs: P0-D3, docs/runbooks/waf-tuning.md
Verified: forced cert renewal in staging, observed new chain
```

## Exemplos inválidos

```
feat: missing scope
                              ❌ scope-empty (scope é obrigatório)

feat(unknown-service): bad scope
                              ❌ scope-enum (não está na lista permitida)

feat(hello-service): add endpoint
                              ❌ body-required-when-typed (feat exige body)

feat(hello-service): add endpoint

short
                              ❌ body-required-when-typed (body < 50 chars)

added stuff
                              ❌ não segue o padrão type(scope): subject

Feat(hello-service): capital letter type
                              ❌ type-case (deve ser lowercase)

refactor(catalog-service)!: drop legacy
                              ❌ body-required-when-typed (! força body)
```

## Múltiplos serviços em um commit

**Evite.** Prefira commits separados por scope (§5.1 do brief). Se for inevitável, escolha o scope dominante e documente os demais no body do commit.

## Como o pipeline usa isso

- **Local (`husky` `commit-msg`):** rejeita commits que falhem no `commitlint`
- **CI (futuro, P0-A4 + grupo F):** revalida no PR via action; PR é bloqueado
- **release-please:** lê `feat`/`fix`/`!` por scope e abre PR de release **por serviço** com changelog automático

## Quando uma regra está atrapalhando

Não bypass com `--no-verify`. Em vez disso:

1. Ajuste a mensagem (95% dos casos)
2. Adicione o scope ausente em `commitlint.config.js` se for um serviço novo legítimo
3. Discuta a regra em uma issue se virar fricção recorrente
