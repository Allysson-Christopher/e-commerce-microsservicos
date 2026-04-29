# Convenções de commit

> Seguimos **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)** com **scope obrigatório**.
> Validado localmente via `husky` + `commitlint`; também rodado no CI.
> Referência primária: [`PROJECT_BRIEF.md` §5.1](../../PROJECT_BRIEF.md).

## Formato

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Type** identifica a *natureza* da mudança. **Scope** identifica *onde* — o serviço ou área afetada. **Subject** descreve *o quê* em uma linha curta.

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

```
feat(hello-service): add /version endpoint

Reads version, commit SHA and build timestamp from environment
variables injected at build time.
```

```
fix(payment-service): make idempotency key check case-insensitive
```

```
chore(deps): bump axios from 1.7.0 to 1.7.4
```

```
docs(repo): add ADR template
```

```
refactor(catalog-service)!: drop legacyCode field

BREAKING CHANGE: clients must migrate to externalId. Bump major.
```

```
ci(repo): add gitleaks scan on PR
```

```
chore(infra): rotate Cloudflare API token
```

## Exemplos inválidos

```
feat: missing scope
                              ❌ scope-empty (scope é obrigatório)

feat(unknown-service): bad scope
                              ❌ scope-enum (não está na lista permitida)

added stuff
                              ❌ não segue o padrão type(scope): subject

Feat(hello-service): capital letter type
                              ❌ type-case (deve ser lowercase)
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
