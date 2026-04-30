# Backlog — Fase 0 (Bootstrap)

> **Objetivo da fase:** plataforma observável, desplegável, com release automático — **antes** de qualquer feature de e-commerce.
> **Marco 0.1:** _"Hello world deployado em staging E prod, observável, com release automático."_
> **Referência:** `PROJECT_BRIEF.md` seção 9 (Plano de Aprendizado Faseado).
> **Estimativa global:** 1-2 semanas (ritmo consistente).

---

## Convenções deste backlog

- **ID:** `P0-<grupo><n>` (ex.: `P0-A1`)
- **Complexidade relativa:** S (pequena, < 1h), M (média, 1-3h), L (grande, 3-8h), XL (>8h, considerar quebrar)
- **DoD** = Definition of Done (critérios objetivos para considerar a tarefa concluída)
- **Dependências** = tarefas que devem estar concluídas antes
- Tarefas marcadas como **[paralelizável]** podem ser feitas fora da ordem estrita, sem dependências bloqueantes
- Tarefas em ordem dentro de cada grupo seguem fluxo lógico

---

## Grupo A — Fundações do repositório ✅ concluído em 2026-04-29

Sem dependências externas — pode iniciar imediatamente.

### P0-A1 — Inicializar Git e estrutura monorepo (S) ✅

- **Status:** concluído em 2026-04-29 (commit `cc83b86`)
- **DoD:**
  - [x] `git init` executado, primeiro commit `chore: bootstrap repository structure`
  - [x] Estrutura criada conforme `PROJECT_BRIEF.md` §4.1:
    ```
    services/  contracts/  frontend/  infra/  libs/  tools/  docs/
    ```
  - [x] `.gitkeep` em diretórios vazios
- **Dependências:** —
- **Notas de execução:**
  - Branch inicial renomeada para `main` (Git default era `master`)
  - Subdiretórios já criados antecipadamente: `contracts/{proto,openapi}`, `infra/{ansible,terraform,docker,k8s}`, `docs/{adr,runbooks,phases,contributing,infra,security,compliance}`
  - `.claude/commands/` versionado em commit separado (`e688264`) seguindo padrão da comunidade Claude Code

### P0-A2 — Arquivos de raiz (S) ✅

- **Status:** concluído em 2026-04-29 (commit `0616ce4`)
- **DoD:**
  - [x] `.gitignore` cobrindo Node, Java/Maven, Go, IDE (.idea, .vscode), envs (.env\*), build outputs
  - [x] `.editorconfig` (LF, UTF-8, 2 spaces default, 4 para Java/Go)
  - [x] `.gitattributes` (line endings)
  - [x] `README.md` inicial com visão de 1 parágrafo + link para `PROJECT_BRIEF.md`
  - [x] `LICENSE` (decidir: MIT? proprietary? — escolher e versionar) → **MIT** escolhida
  - [x] `CODEOWNERS` (mesmo solo, para futura referência)
- **Dependências:** P0-A1
- **Notas de execução:**
  - Licença: MIT em nome de "Allysson Christopher" (2026)
  - `.gitignore` também cobre Terraform/OpenTofu, Ansible, Docker, e overrides pessoais do Claude Code (`.claude/settings.local.json`, `.claude/projects/`, `.claude/memory/`)

### P0-A3 — Workspaces poliglotas (S) ✅

- **Status:** concluído em 2026-04-29 (commit `5c04e4d`)
- **DoD:**
  - [x] `package.json` raiz com `npm workspaces` apontando para `services/*` e `frontend/*`
  - [x] `go.work` inicializado (mesmo vazio, será populado quando o gateway for adicionado)
  - [x] Ausência de `pom.xml` raiz (decisão: cada serviço Java standalone — §3.1 do brief)
- **Dependências:** P0-A1
- **Notas de execução:**
  - Runtime versions pinadas com **desvio consciente do brief v1.0**: Node 24 LTS (não 22), npm 11, Go 1.26 (não 1.23), Java 25 LTS (não 21) — todos LTS mais recentes em 2026-04-29. Ver `memory/runtime_versions.md`.
  - `engines.node >=24.15.0`, `engines.npm >=11.0.0`, `packageManager: npm@11.13.0` (Corepack)
  - `go.work` com `go 1.26`, sem `use()` ainda

### P0-A4 — Conventional Commits + commitlint + husky (M) ✅

- **Status:** concluído em 2026-04-29 (commits `9cf0054`, `79b99ec`)
- **DoD:**
  - [x] `husky` instalado e ativo (`prepare` script no `package.json`)
  - [x] `commitlint` configurado com `@commitlint/config-conventional`
  - [x] **Scope obrigatório** habilitado conforme §5.1 (regra customizada para exigir `(<service>)`)
  - [x] Hook `commit-msg` validando localmente
  - [x] Documentação `docs/contributing/commits.md` com exemplos válidos e inválidos
- **Dependências:** P0-A3
- **Notas de execução:**
  - **Extensão custom:** plugin `body-required-when-typed` exige body ≥50 chars para `feat`/`fix`/`refactor`/`perf` e qualquer commit `!`. Decisão para suportar workflow solo+LLM onde `git log` é o memorando institucional.
  - `CLAUDE.md` criado no root para que toda sessão futura do Claude aplique a política de commit messages automaticamente.
  - Scopes enumerados: `hello-service`, `repo`, `deps`, `ci`, `docs`, `infra`, `contracts`, `frontend`, `observability`, `security`, `release` — adicionar conforme novos serviços nascerem.

### P0-A5 — Pre-commit hooks (M) ✅

- **Status:** concluído em 2026-04-29 (commit `842322c`)
- **DoD:**
  - [x] `lint-staged` configurado
  - [x] Hook `pre-commit` executando: Prettier (md/yaml/json), gitleaks
  - [x] Configuração `.gitleaks.toml` se necessário (allowlist de placeholders óbvios)
  - [x] Documentação rápida em `docs/contributing/local-setup.md`
- **Dependências:** P0-A4
- **Notas de execução:**
  - **gitleaks 8.30.1** (latest, 2026-03-21) instalado via `tools/install-dev-tools.sh` — script idempotente em `~/.local/bin/`, sem sudo. Padrão reutilizável para futuras ferramentas binárias (cosign, syft, kubeseal, etc.).
  - Prettier escopo: `md/mdx/yml/yaml/json/jsonc/js/jsx/ts/tsx/css/scss/html`. `PROJECT_BRIEF.md` em `.prettierignore` para preservar formatação manual.
  - `.gitleaks.toml` estende ruleset upstream e adiciona allowlist mínima (Stripe sandbox keys, GitHub Actions `${{ secrets.* }}`, placeholders óbvios em docs).
  - Hook fail-closed: se `gitleaks` não estiver no PATH, commit aborta com hint para rodar o instalador.

---

## Grupo B — Setup externo e contas

[paralelizável com Grupo A]

### P0-B1 — Configurar repositório no GitHub (S) 🟡 parcial

- **Status:** parcialmente concluído em 2026-04-30. Repo criado, proteção client-side ativa, config de merge aplicada parcialmente (auto-merge paywalled). Faltam Environments `staging` e `production`.
- **DoD original (e o que foi efetivamente feito):**
  - [x] Repositório criado — `Allysson-Christopher/e-commerce-microsservicos`, **privado**
  - [x] Push do estado atual — `main` em `origin/main`
  - [⚠️] **Branch protection** em `main` — **substituída por proteção client-side** (ver ADR-0005):
    - [x] Exigir PR — enforced via `.husky/pre-push` (tripwire local)
    - [ ] Exigir CI verde — pendente do Grupo F (mesmo no caminho server-side seria adiado)
    - [x] Apenas **squash merge** habilitado — `allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false` aplicados via `gh repo edit`
    - [x] Exigir histórico linear — política preservada (squash via `gh pr merge --squash`); enforcement server-side pendente
    - [x] Sem push direto, sem force push em main — enforced client-side via `.husky/pre-push`
  - [⚠️] **Auto-merge** — toggle `allow_auto_merge` ignorado silenciosamente pela API (paywall do GitHub Free privado, manifestação diferente do erro 403 da branch protection)
  - [x] **Delete branch on merge** — `delete_branch_on_merge=true` aplicado (não é paywalled)
  - [ ] **Environments** `staging` (sem reviewers) e `production` (com required reviewers) — pendente; próximo passo desta tarefa
- **Dependências:** P0-A1
- **Notas de execução:**
  - **Bloqueio principal descoberto:** GitHub Free **não permite** branch protection nem rulesets em repos privados (HTTP 403 "Upgrade to GitHub Pro or make this repository public"). Decisão consciente de manter privado e gratuito → adotamos hook local como fallback.
  - **ADR-0005** registra a decisão completa (com alternativas descartadas: tornar público, GitHub Pro, adiar). Hook em `.husky/pre-push`, doc em `docs/contributing/local-setup.md`.
  - **Bloqueio secundário (mesmo paywall, manifestação diferente):** `allow_auto_merge` também é paywalled em privados Free. Diferente da branch protection, a API **não retorna erro** — aceita o PATCH e silenciosamente mantém `false`. Confirmado via doc oficial e via tentativa direta de `gh api -X PATCH ... -f allow_auto_merge=true`. Documentado aqui em vez de em ADR separada porque é instância da posição já registrada em ADR-0005 ("GitHub Free retém features X em privados; adaptamos client-side ou adiamos até migração de plano"); decisão (adiar até plano permitir) não muda.
  - **Impacto prático do auto-merge ausente:** baixo até o Grupo F. Sem CI, mesclar manualmente após push de PR é trivial. Quando workflows de CI tornarem espera real, reavaliar (ir público, assinar Pro, ou aceitar merge manual após CI verde).
  - Hook é **tripwire client-side**, não enforcement real — bypass-able com `--no-verify`, push de outra máquina, ou API. Disciplina humana continua sendo o gate principal.
  - **Migração futura:** quando tornarmos o repo público OU subirmos pra Pro/Team OU migrarmos pra org paga, ativar branch protection (ou rulesets) server-side **e** auto-merge — hook continua útil como atalho local.
  - **Validado em produção:** PR #1 (`ecc7f08`) exercitou todo o ciclo (branch + push + PR + squash-merge + delete branch + sync local). Hook bloqueou push direto em main; deixou passar push em branch de feature. Histórico linear preservado.

### P0-B2 — Cloudflare: zona DNS e configuração base (M)

- **DoD:**
  - Conta Cloudflare ativa (free tier)
  - Zona criada para o domínio (decidir/comprar/apontar nameservers)
  - Registros A iniciais (placeholders apontando para a VPS Hostinger):
    - `meuapp.com` → IP da VPS (proxied)
    - `staging.meuapp.com` → IP da VPS (proxied)
    - `traefik.staging.meuapp.com`, `grafana.staging.meuapp.com` (admin, proxied)
  - SSL/TLS modo **Full (Strict)**
  - HSTS habilitado
  - **Bot Fight Mode** habilitado
  - Token de API criado (escopo mínimo de zona) — guardar para Terraform/OpenTofu
- **Dependências:** —

### P0-B3 — GHCR e tokens (S)

- **DoD:**
  - GHCR habilitado para o repositório
  - PAT do GitHub com `write:packages` criado (apenas se necessário; preferir `GITHUB_TOKEN` em workflows)
  - Visibilidade dos pacotes definida (privado por default)
- **Dependências:** P0-B1

### P0-B4 — Verificar acesso à VPS Hostinger (S)

- **DoD:**
  - SSH com senha funciona como root (acesso inicial confirmado)
  - IP público anotado em local seguro
  - Especificações da VPS confirmadas (RAM, CPU, disco) e registradas em `docs/infra/vps-specs.md`
- **Dependências:** —

---

## Grupo C — Bootstrap da VPS via Ansible

Sequencial. Depende de B4.

### P0-C1 — Inventário Ansible inicial e teste de conectividade (S)

- **DoD:**
  - `infra/ansible/inventory/hosts.yml` com host da VPS (IP, user inicial root)
  - `ansible-playbook -i ... ping.yml` executando com sucesso
  - Documentação rápida em `docs/runbooks/ansible-quickstart.md`
- **Dependências:** P0-B4

### P0-C2 — Playbook bootstrap: usuário deploy + SSH hardening (M)

- **DoD:**
  - Role `common` cria usuário `deploy` (sem sudo) com SSH key (chave pública gerada localmente)
  - SSH config: `PasswordAuthentication no`, `PermitRootLogin no`, `Port 22` (manter ou trocar — se trocar, atualizar em todo lugar)
  - Confirmado acesso SSH como `deploy` antes de bloquear root
  - **Não bloquear root antes de validar acesso como deploy**
- **Dependências:** P0-C1

### P0-C3 — Hardening sistêmico (M)

- **DoD:**
  - `ufw` habilitado: apenas portas 22, 80, 443 abertas
  - `fail2ban` instalado e configurado para SSH
  - Timezone definido (`America/Sao_Paulo` ou conforme preferência)
  - NTP ativo
  - Swap configurado (~2 GB ou conforme RAM da VPS — `docs/infra/vps-specs.md` referência)
  - `unattended-upgrades` para patches de segurança
  - `logrotate` revisado
- **Dependências:** P0-C2

### P0-C4 — Instalar Docker e Docker Compose (S)

- **DoD:**
  - Role `docker` instala Docker Engine + Compose plugin
  - Usuário `deploy` no grupo `docker`
  - `docker version` e `docker compose version` retornam saída válida via SSH como `deploy`
- **Dependências:** P0-C3

### P0-C5 — Estrutura de diretórios na VPS (S)

- **DoD:**
  - `/home/deploy/ecommerce/staging/` criado com subpastas `data/`, `logs/`
  - `/home/deploy/ecommerce/prod/` idem
  - Permissões 750 para `deploy:deploy`
  - `.env.example` colocado em cada (sem secrets) — placeholder
- **Dependências:** P0-C4

---

## Grupo D — DNS, reverse proxy e TLS

Depende de B2 + C5.

### P0-D1 — OpenTofu/Cloudflare: registros DNS via IaC (M)

- **DoD:**
  - `infra/terraform/cloudflare/` com providers e backend remoto configurado (Backblaze B2 ou alternativa S3-compatible)
  - Registros A migrados de manuais para gerenciados via OpenTofu
  - Page rules iniciais: cache em catálogo público (placeholder), no-cache em rotas autenticadas
  - WAF Managed Rulesets (free) habilitados
  - `tofu plan` executado e aplicado
- **Dependências:** P0-B2

### P0-D2 — Traefik via Compose na VPS (M)

- **DoD:**
  - `infra/docker/traefik/docker-compose.yml` rodando em `/home/deploy/traefik/`
  - 2 redes Docker criadas: `ecommerce-staging-net`, `ecommerce-prod-net`
  - Traefik conectado a ambas as redes
  - Dashboard do Traefik acessível em subdomínio admin com basic auth
  - Healthcheck funcionando
- **Dependências:** P0-C5

### P0-D3 — TLS automático com Let's Encrypt (M)

- **DoD:**
  - Resolver Let's Encrypt configurado (TLS-ALPN ou HTTP-01 via 80)
  - Certificados emitidos automaticamente para `meuapp.com`, `staging.meuapp.com` e admin subdomains
  - Renovação testada (forçando expiração baixa em ambiente de teste)
  - Estado dos certs persistido em volume
- **Dependências:** P0-D2

### P0-D4 — Authenticated Origin Pulls (mTLS Cloudflare → Origin) (M)

- **DoD:**
  - Cert do Cloudflare baixado e instalado no Traefik
  - Traefik configurado para exigir client cert válido
  - Acesso direto ao IP da VPS via curl (sem cert) retorna 401/403
  - Acesso via Cloudflare funciona normalmente
- **Dependências:** P0-D3

### P0-D5 — Headers de segurança via middleware Traefik (M)

- **DoD:**
  - Middleware `security-headers` aplicado por default em todos os roteadores:
    - `Strict-Transport-Security` (HSTS preload)
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy` restritivo
    - `Content-Security-Policy` baseline (será refinado quando frontend chegar)
  - Middleware `rate-limit` aplicado em rotas administrativas
  - Verificado com `curl -I` retornando todos os headers
- **Dependências:** P0-D3

### P0-D6 — Coraza WAF plugin no Traefik (L)

- **DoD:**
  - Plugin Coraza configurado com OWASP CRS
  - Modo inicial: **DetectionOnly** (loga sem bloquear) por 1-2 dias
  - Logs do Coraza visíveis no Loki (após Grupo G)
  - Documentação de tuning em `docs/runbooks/waf-tuning.md`
- **Dependências:** P0-D5
- **Nota:** pode ser quebrada — habilitar em modo log primeiro, switch para enforce em sub-tarefa posterior

---

## Grupo E — Hello service (dummy)

Depende de A. Pode iniciar em paralelo com C/D.

### P0-E1 — Decidir linguagem do hello-service (S)

- **DoD:**
  - Decisão registrada em `docs/adr/ADR-XXX-hello-service-language.md`
  - **Recomendação:** Java/Spring Boot (exercita o stack mais pesado primeiro, valida tooling Maven + Spring no monorepo, pega problemas de RAM cedo na VPS)
  - Alternativa: Node/NestJS (mais rápido de subir, menos memória)
- **Dependências:** P0-A3

### P0-E2 — Implementar hello-service (M)

- **DoD:**
  - `services/hello-service/` com projeto Spring Boot (ou NestJS)
  - Endpoints:
    - `GET /health` → 200 com `{ "status": "UP" }` + checks
    - `GET /version` → `{ service, version, commit, builtAt }` (versão lida de variáveis de build)
    - `GET /` → "Hello from staging" / "Hello from prod" baseado em env var
  - Logs estruturados em JSON
  - `pom.xml` (ou `package.json`) com versão `0.1.0`
- **Dependências:** P0-E1

### P0-E3 — Dockerfile multi-stage do hello-service (M)

- **DoD:**
  - Imagem build em multi-stage (build + runtime separados)
  - Imagem final baseada em distroless ou alpine slim
  - **Rootless** (USER não-root)
  - Healthcheck no Dockerfile
  - Tamanho final < 300 MB (Java) ou < 200 MB (Node)
  - `.dockerignore` correto
- **Dependências:** P0-E2

### P0-E4 — docker-compose.yml local para dev (S)

- **DoD:**
  - `services/hello-service/docker-compose.dev.yml` permite rodar local
  - `make dev-hello` (Makefile raiz) sobe o serviço localmente
  - Documentação em `services/hello-service/README.md`
- **Dependências:** P0-E3

### P0-E5 — Compose de staging e prod com hello-service (M)

- **DoD:**
  - `infra/docker/staging/docker-compose.yml` inclui hello-service
  - `infra/docker/prod/docker-compose.yml` idem
  - Labels Traefik corretas para roteamento por subdomínio:
    - `staging.meuapp.com` → hello-service em staging-net
    - `meuapp.com` → hello-service em prod-net
  - Resource limits (memória/CPU) definidos
  - Healthcheck integrado ao Traefik
- **Dependências:** P0-E3, P0-D5

---

## Grupo F — CI/CD pipeline

Depende de E + B + C.

### P0-F1 — Workflow CI: lint + test do hello-service (M)

- **DoD:**
  - `.github/workflows/ci-hello-service.yml`
  - Triggers: PR e push em main com path filter para `services/hello-service/**`
  - Jobs: lint, test, build (jar/dist), upload de artifact
  - Cache de dependências (Maven `.m2` ou npm `node_modules`)
  - Matrix se aplicável (versões de runtime)
- **Dependências:** P0-E2, P0-B1

### P0-F2 — Workflow build + push para GHCR (M)

- **DoD:**
  - Job build constrói imagem com tag `ghcr.io/<owner>/hello-service:<version>` e `:latest`
  - Push para GHCR com `GITHUB_TOKEN`
  - **Trivy scan** na imagem; bloqueia se HIGH/CRITICAL (com `.trivyignore` se necessário)
  - Tag de imagem visível em `Packages` do GitHub
- **Dependências:** P0-F1, P0-B3

### P0-F3 — SSH key e setup de deploy (S)

- **DoD:**
  - Par de chaves SSH dedicado para deploy (gerado localmente)
  - Pública instalada no `authorized_keys` do `deploy` na VPS (via Ansible)
  - Privada armazenada como GitHub Secret `DEPLOY_SSH_KEY` em ambiente correspondente
  - Conexão testada via Action manual (`workflow_dispatch`)
- **Dependências:** P0-C2

### P0-F4 — Workflow CD staging (deploy automático no merge) (L)

- **DoD:**
  - `.github/workflows/cd-staging.yml`
  - Triggers: push em `main` com path filter para `services/hello-service/**`
  - Job environment: `staging`
  - Steps:
    1. Checkout
    2. Login GHCR
    3. SSH na VPS, `docker compose pull && docker compose up -d --no-deps hello-service`
    4. Wait for healthcheck
    5. **Smoke test** (curl `/health` e `/version` em staging.meuapp.com)
    6. Notificar sucesso/falha
  - Rollback automático se smoke test falhar (usar tag anterior)
- **Dependências:** P0-F3, P0-E5

### P0-F5 — Workflow CD prod (deploy em release publicado) (M)

- **DoD:**
  - `.github/workflows/cd-prod.yml`
  - Trigger: `release: published` (apenas para releases do hello-service)
  - Job environment: `production` (com **manual approval** ativo)
  - Mesmos steps de F4 mas para o stack de prod
  - Smoke test no domínio principal
- **Dependências:** P0-F4

### P0-F6 — release-please configurado para hello-service (M)

- **DoD:**
  - `release-please-config.json` com entry para `services/hello-service`
  - `.release-please-manifest.json` inicial
  - Workflow `.github/workflows/release-please.yml` rodando em push em main
  - Primeiro PR de release abrindo automaticamente após commit `feat(hello-service): ...`
  - Merge do PR cria tag `hello-service-v0.1.0` e GitHub Release
  - Release dispara F5 (CD prod)
- **Dependências:** P0-F2, P0-A4

---

## Grupo G — Observabilidade

[paralelizável com F]

### P0-G1 — OpenTelemetry Collector (M)

- **DoD:**
  - `infra/docker/observability/otel-collector/` com config
  - Receivers: OTLP gRPC + HTTP
  - Processadores: batch, memory_limiter, attributes (enrichment)
  - Exporters: Prometheus, Loki, Tempo
  - Container rodando em rede compartilhada com observability stack
- **Dependências:** P0-D2

### P0-G2 — Prometheus (M)

- **DoD:**
  - `infra/docker/observability/prometheus/` com config
  - Scraping de targets: hello-service, traefik, otel-collector, próprio Prometheus
  - Retention: 15 dias (conforme brief §6.1)
  - Container rodando, UI acessível em subdomínio admin com basic auth
- **Dependências:** P0-G1

### P0-G3 — Loki (M)

- **DoD:**
  - `infra/docker/observability/loki/` com config
  - Recebendo logs via OTLP do Collector
  - Retention: 7 dias
  - Acessível através do Grafana
- **Dependências:** P0-G1

### P0-G4 — Tempo (M)

- **DoD:**
  - `infra/docker/observability/tempo/` com config
  - Recebendo traces via OTLP do Collector
  - Retention: 3 dias
  - Acessível através do Grafana
- **Dependências:** P0-G1

### P0-G5 — Grafana (M)

- **DoD:**
  - `infra/docker/observability/grafana/` com config
  - Datasources: Prometheus, Loki, Tempo configurados via provisioning
  - Acesso: subdomínio admin (`grafana.staging.meuapp.com`) com **OAuth ou basic auth forte** (não default admin/admin)
  - Dashboards seed:
    - "Service Health" (uptime, RED metrics genéricas)
    - "Traefik" (requests, latency, status codes)
    - "Infra" (CPU, RAM, disk da VPS via node_exporter)
- **Dependências:** P0-G2, P0-G3, P0-G4

### P0-G6 — Instrumentar hello-service com OTel (L)

- **DoD:**
  - hello-service exporta:
    - Métricas em formato Prometheus em `/metrics` (Micrometer/prom-client)
    - Traces via OTLP para o Collector
    - Logs estruturados (já via JSON; agora com `traceId`/`spanId` correlacionados)
  - Variáveis de ambiente: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`
  - Validação visual: chamar `/health` várias vezes; ver linha de tempo correlata em Grafana (logs ↔ traces ↔ métricas)
- **Dependências:** P0-G5, P0-E2

### P0-G7 — node_exporter para métricas da VPS (S)

- **DoD:**
  - node_exporter instalado via Ansible (role dedicada)
  - Acessível apenas via rede interna do Docker
  - Prometheus coletando métricas
  - Dashboard "Infra" do Grafana mostrando dados
- **Dependências:** P0-G2

---

## Grupo H — Segurança baseline e qualidade

[paralelizável com F/G]

### P0-H1 — SECURITY.md e security.txt (S)

- **DoD:**
  - `SECURITY.md` na raiz com:
    - Política de divulgação responsável
    - Canal de contato
    - Escopo
  - `frontend/web/public/.well-known/security.txt` (placeholder; será montado quando o front existir; por ora documentar plano em `docs/security/security-txt-plan.md`)
- **Dependências:** —

### P0-H2 — gitleaks no CI (S)

- **DoD:**
  - `.github/workflows/ci-security.yml` job gitleaks
  - Roda em todo PR e push em main
  - Bloqueia PR se detectar secret
  - Já configurado em pre-commit (P0-A5) — aqui é a contraparte CI
- **Dependências:** P0-A5, P0-B1

### P0-H3 — Trivy scan em IaC e Dockerfile (M)

- **DoD:**
  - Job Trivy `config` scan em `infra/` (Dockerfiles, Compose)
  - Job Checkov scan em `infra/terraform/` e `infra/ansible/`
  - Bloqueia HIGH/CRITICAL em images
  - Falsos positivos documentados em `.checkov.yml` / `.trivyignore`
- **Dependências:** P0-F2

### P0-H4 — Renovate configurado (M)

- **DoD:**
  - `renovate.json` na raiz
  - GitHub App Renovate instalado no repo
  - Cobertura: Maven, npm, Go, Docker base images, GitHub Actions, Helm (futuro)
  - Auto-merge habilitado para patches em deps de dev
  - Schedule fora do horário comercial
- **Dependências:** P0-B1

### P0-H5 — SonarCloud (M)

- **DoD:**
  - Conta SonarCloud vinculada ao repo
  - `.github/workflows/ci-quality.yml` enviando análise em PR
  - Quality Gate definido (cobertura, code smells, duplicação) — valores iniciais conservadores
  - Badge no README
- **Dependências:** P0-F1

---

## Grupo I — Documentação

[paralelizável; a maioria pode ir incrementando ao longo da fase]

### P0-I1 — README com quickstart (M)

- **DoD:**
  - Visão de 1 parágrafo
  - Stack resumida
  - Quickstart local (`make dev-hello`, `make up-observability`, etc)
  - Como deployar (link para runbooks)
  - Links para `PROJECT_BRIEF.md`, `SECURITY.md`, `docs/adr/`
- **Dependências:** P0-A2 (mínimo); refinar depois

### P0-I2 — Estrutura de runbooks (S)

- **DoD:**
  - `docs/runbooks/` com índice
  - Esqueletos:
    - `vps-down.md`
    - `restore-from-backup.md` (placeholder; será preenchido na Fase 1)
    - `rotate-secrets.md`
    - `incident-response.md`
    - `ansible-quickstart.md`
- **Dependências:** —

### P0-I3 — ADR template + ADRs antecipadas (M) ✅

- **Status:** concluído em 2026-04-29 (commits `0cc6b1b`, `a7f6772`)
- **DoD:**
  - [x] `docs/adr/template.md` no formato Michael Nygard (ver `CLAUDE.md` §"ADRs — leia antes de decidir algo arquitetural" para a estrutura obrigatória)
  - [x] `docs/adr/README.md` como índice (status, data, link) e descrevendo a política deste repo: ADR nasce junto com a implementação no PR da tarefa; lote inicial é exceção controlada
  - [x] **ADRs antecipadas em lote** (decisões já tomadas no brief e/ou já em uso desde o primeiro commit):
    - [x] `ADR-0000` — Como usamos ADRs neste projeto (meta-processo)
    - [x] `ADR-0001` — Adotar monorepo único poliglota (refs §4.1)
    - [x] `ADR-0002` — Conventional Commits com scope obrigatório + body-required-when-typed (refs §5.1; já em uso desde P0-A4)
    - [x] `ADR-0003` — Trunk-based development com squash merge (refs §5.2)
    - [x] `ADR-0004` — Versionamento independente por serviço com release-please (refs §5.1)
- **Dependências:** —
- **Nota:** demais ADRs **não** são criadas aqui. Cada uma nasce no PR da tarefa que toma a decisão correspondente — ex.: `ADR-0005` (VPS Hostinger única) sai junto com P0-C\*; `ADR-0006` (Ansible + OpenTofu) com P0-C1/D1; `ADR-0007` (Cloudflare + Traefik + AOP) com P0-D2/D3/D4; `ADR-0008` (linguagem do hello-service) é o próprio DoD da P0-E1; `ADR-0009` (LGTM + OTel) com P0-G1; e assim por diante. Lista completa de candidatas e em qual tarefa cada uma deve nascer fica versionada em `docs/adr/README.md`.
- **Notas de execução:**
  - Política da regra default ("ADR junto com a implementação") fixada em `CLAUDE.md` (commit `0cc6b1b`) e na ADR-0000.
  - As 4 ADRs estruturais (0001-0004) referenciam-se mutuamente: 0001 (monorepo) motiva o scope obrigatório de 0002, que alimenta o roteamento de 0004; 0003 (squash merge) gera o histórico linear consumido por 0004.

### P0-I4 — Reflexão de fim de fase (S)

- **DoD:**
  - `docs/phases/phase-0.md` documentando:
    - O que foi entregue
    - O que funcionou bem
    - O que mudaria
    - Riscos identificados pra Fase 1
- **Dependências:** todas as outras de Fase 0

---

## Resumo da ordem crítica (caminho mais curto até Marco 0.1)

```
A1 → A2 → A3 → A4 → A5
                    ↓
        B1, B4 (paralelo a A)
                    ↓
        B2 → D1 (DNS via IaC)
        C1 → C2 → C3 → C4 → C5 (VPS bootstrap)
                              ↓
        D2 → D3 → D4 → D5 (Traefik + TLS + AOP + headers)
                              ↓
        E1 → E2 → E3 → E5 (hello-service + compose)
                              ↓
        F3 → F1 → F2 → F4 → F5 → F6 (CI/CD + release-please)
                              ↓
        G1 → G2/G3/G4 → G5 → G6 (observabilidade)
                              ↓
        I4 (reflexão)
```

Tarefas dos grupos H e I podem entrar a qualquer momento sem bloquear o caminho crítico.

---

## Métricas de "fase concluída" (Marco 0.1)

A Fase 0 está concluída quando **todos os critérios abaixo** são verdade:

- [x] `git log` mostra histórico linear com commits no padrão Conventional Commits _(P0-A4; daqui pra frente, todos os commits seguem a regra)_
- [ ] PR para `main` é bloqueado se CI falhar
- [ ] `https://staging.meuapp.com/` retorna "Hello from staging" via HTTPS válido
- [ ] `https://meuapp.com/` retorna "Hello from prod" via HTTPS válido
- [ ] `https://staging.meuapp.com/version` mostra versão semântica e commit SHA
- [ ] Acesso direto ao IP da VPS retorna 401/403 (mTLS Cloudflare → Origin ativo)
- [ ] Push em `main` deploya automaticamente em staging em < 5 min
- [ ] Tag `hello-service-v0.x.y` deploya em prod com manual approval
- [ ] release-please abre PR de release automaticamente
- [ ] Grafana mostra logs, métricas e traces correlacionados do hello-service
- [ ] Headers de segurança aparecem em `curl -I https://staging.meuapp.com/`
- [x] gitleaks bloqueia commit/PR com secret de teste _(parcial: bloqueia commit local via P0-A5; CI ainda em P0-H2)_
- [ ] Trivy scan rodando no CI; HIGH/CRITICAL bloqueia
- [ ] SonarCloud Quality Gate verde
- [ ] `docs/phases/phase-0.md` escrito com reflexão

---

## Riscos identificados antecipadamente

- **RAM limitada na VPS Hostinger** — observability stack + Keycloak (Fase 1) + Kafka (Fase 1) podem apertar. Validar consumo já na Fase 0.
- **DNS propagation** — após apontar nameservers do Cloudflare, propagação pode levar horas. Iniciar B2 cedo.
- **Let's Encrypt rate limits** — não fazer testes excessivos de TLS em produção; usar staging do LE para validações.
- **AOP (Authenticated Origin Pulls) bloqueia debugging direto** — para troubleshooting, ter procedimento para temporariamente bypassar via tunnel SSH.
- **Cobrir tudo da Fase 0 antes de tocar features** — disciplina necessária; não pular para hello-service sem o resto pronto.

---

_Backlog vivo — atualizar conforme avançamos. Marcar tarefas concluídas com [x]._
