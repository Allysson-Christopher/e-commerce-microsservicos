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

### P0-B1 — Configurar repositório no GitHub (S) ✅

- **Status:** concluído em 2026-04-30. Repo público com branch protection server-side, auto-merge, required reviewer em production e environments criados.
- **DoD:**
  - [x] Repositório criado — `Allysson-Christopher/e-commerce-microsservicos`, **público** (cutover de privado em 2026-04-30 — ver ADR-0006)
  - [x] Push do estado atual — `main` em `origin/main`
  - [x] **Branch protection** em `main` (server-side via API REST do GitHub):
    - [x] Exigir PR — enforced server-side
    - [ ] Exigir CI verde — `required_status_checks=null` por enquanto; preencher nomes de jobs após Grupo F
    - [x] Apenas **squash merge** habilitado — `allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false`
    - [x] Exigir histórico linear — `required_linear_history=true`
    - [x] Sem push direto, sem force push, sem deleção em main — `enforce_admins=true`, `allow_force_pushes=false`, `allow_deletions=false`
  - [x] **Auto-merge** — `allow_auto_merge=true`
  - [x] **Delete branch on merge** — `delete_branch_on_merge=true`
  - [x] **Environments** criados:
    - [x] `staging` (sem reviewers)
    - [x] `production` com **required reviewer = Allysson-Christopher** (id 128186654) — simula approval gate do DoD original
- **Dependências:** P0-A1
- **Notas de execução:**
  - **Histórico didático (paywalls descobertas em 2026-04-30):** durante a primeira tentativa, com repo privado em GitHub Free, três features bateram paywall — branch protection (HTTP 403), auto-merge (silently ignored), required reviewers em environments (HTTP 422). Adotamos hook client-side em `.husky/pre-push` como fallback (ver **ADR-0005**, hoje superseded).
  - **Cutover para público (ADR-0006):** prioridade de aprendizado falou mais alto que privacidade do código educacional. Repo virou público via `gh api -X PATCH .../e-commerce-microsservicos -f visibility=public` (a flag `gh repo edit --visibility` exige gh ≥ 2.50; usamos a versão 2.45 e a API direta — anotar em runbook futuro).
  - **Email noreply** configurado pra commits futuros (`128186654+Allysson-Christopher@users.noreply.github.com`, escopo: este repo). Histórico anterior ao cutover **não foi reescrito** — operação destrutiva, ganho marginal.
  - **Hook pre-push removido** após o cutover — server-side cobre a regra com mais robustez (vale para qualquer cliente git, não só máquinas com husky).
  - **Validações em produção (todas no fluxo PR-only):**
    - PR #1 (`ecc7f08`) — pre-push hook ativado, validou bloqueio de push direto em main e passagem em feature branch.
    - PR #2 (`b20cafc`) — auto-merge paywall confirmada e documentada nas notas.
    - PR #3 (`a4bc16e`) — `--delete-branch` redundante removido do fluxo recomendado.
    - PR #4 (cutover deste registro) — repo público, server-side ativa, hook removido.
  - **Baseline de segurança pós-cutover (2026-04-30):** habilitados via `gh api` — Dependabot
    vulnerability alerts, Dependabot security updates (auto-PRs), secret scanning, secret
    scanning push protection, private vulnerability reporting. Dois sub-toggles
    (`secret_scanning_non_provider_patterns`, `secret_scanning_validity_checks`) seguem em
    paywall **GHAS** — API aceita o PATCH (HTTP 200) mas persiste `disabled` (mesma
    assinatura do silent-ignore de auto-merge no plano free privado). Mitigação para
    padrões genéricos: gitleaks no pre-commit (P0-A5), espelhado em CI por P0-H2.

### P0-B2 — Cloudflare: zona DNS e configuração base (M) ✅ concluído em 2026-05-02

- **Status:** concluído em 2026-05-02. Domínio `chatdelta.cloud` (não o originalmente planejado `loja.chatdelta.ia.br`) — ver "Notas de execução".
- **DoD:**
  - [x] Conta Cloudflare ativa (free tier) com MFA TOTP via Bitwarden
  - [x] Zona `chatdelta.cloud` criada via full setup (NS apontados pra `marty.ns.cloudflare.com` + `destiny.ns.cloudflare.com` no painel Hostinger; status **Active**)
  - [x] Registros A iniciais apontando para o Elastic IP da EC2 (`32.193.69.140`):
    - [x] `chatdelta.cloud` → EIP (proxied) — apex, futuro prod
    - [x] `staging.chatdelta.cloud` → EIP (proxied)
    - [x] `traefik.staging.chatdelta.cloud` → EIP (proxied)
    - [x] `grafana.staging.chatdelta.cloud` → EIP (proxied)
    - [x] CNAME `www → chatdelta.cloud` (proxied) — padrão útil
  - [x] SSL/TLS modo **Full (strict)** (Automatic mode desabilitado pra controle explícito)
  - [x] HSTS habilitado conservador: `max-age=2592000` (30 dias), `includeSubDomains=Off`, `preload=Off`, No-Sniff Header On — plano de ramp documentado em `docs/infra/cloudflare.md`
  - [x] **Bot Fight Mode** habilitado
  - [x] Token de API `opentofu-chatdelta-cloud-dns` criado com escopo mínimo (`Zone:Read` + `Zone:DNS:Edit` em `chatdelta.cloud` apenas) — armazenado em Bitwarden vault, **nunca** versionado
- **Dependências:** **P0-B4** (Elastic IP alocado em 2026-05-02 nesta sessão; ver `docs/infra/cloudflare.md` seção "Origem")
- **Notas de execução:**
  - **Pivot de domínio (2026-05-02):** plano original era `loja.chatdelta.ia.br` (subdomínio delegado de domínio existente). **Bloqueio descoberto durante execução:** Cloudflare paywallizou subdomain zone setup (Enterprise-only) e CNAME setup partial (Business-only) no plano free. Avaliados 4 caminhos (migrar `chatdelta.ia.br` inteiro / comprar domínio dedicado / Route 53 / pagar CF Business). Escolha: **comprar `chatdelta.cloud` na Hostinger** — isolação total, custo trivial (~$15/ano), Cloudflare features completas no free, branding mais limpo pra portfolio. Detalhes em `docs/runbooks/cloudflare-setup.md` seção "Escolhas operacionais".
  - **Decidido NÃO criar ADR pra esse pivot** — é decisão operacional decorrente de limitação de plano CF, não nova decisão arquitetural; já implícito sob ADR-0008. Runbook + nota aqui cobrem o registro.
  - **Documentação produzida nesta tarefa:**
    - `docs/runbooks/cloudflare-setup.md` — runbook reproduzível do zero (registrar→NS→zona→SSL→HSTS→Bot Fight→token), com critérios de escolha de registrar e plano de ramp HSTS
    - `docs/infra/cloudflare.md` — registro declarativo do estado atual (zona, NS, EIP origem, registros DNS, SSL, HSTS, tokens) — vira espelho do state OpenTofu quando P0-D1 importar
  - **Verificação final:** `dig +short A *.chatdelta.cloud @1.1.1.1` retorna IPs Cloudflare (`104.21.x.x` + `172.67.x.x`) em todos os 4 hostnames — origem `32.193.69.140` permanece escondida conforme brief §7.2.
  - **Hostnames resultantes substituem os de `meuapp.com` do brief original** em toda a documentação subsequente (P0-D2 a P0-D5, Grupo E hello-service, Grupo G observability admin URLs).
  - **Nada configurado em Page Rules / WAF Custom Rules / Workers / Turnstile / Logpush** — esses ficam pra Grupo D (P0-D1+) e Fase 1.

### P0-B3 — GHCR e tokens (S)

- **DoD:**
  - GHCR habilitado para o repositório
  - PAT do GitHub com `write:packages` criado (apenas se necessário; preferir `GITHUB_TOKEN` em workflows)
  - Visibilidade dos pacotes definida (privado por default)
- **Dependências:** P0-B1

### P0-B4 — Inventário e baseline AWS (M) ✅ parcialmente concluído em 2026-05-01

- **Status:** núcleo concluído nesta sessão (auth + EC2 + SSM + Budget); pendentes Elastic IP, EBS persistente e doc de specs.
- **DoD:**
  - [x] Conta AWS confirmada e acessível (account `905418198749`, home region `us-east-1` para Identity Center — não muda sem deletar)
  - [x] EC2 inicial provisionada (`i-072708190abd3d102`, `t3.micro`, AL2023 2023.11.20260413, `us-east-1b`)
  - [x] **IAM Identity Center** habilitado, usuário `allysson` em permission set `AdministratorAccess` com MFA TOTP
  - [x] AWS CLI v2.34.41 instalado per-user em `~/.local/bin/aws` (mesmo padrão de `gitleaks` da P0-A5)
  - [x] Profile SSO `AdministratorAccess-905418198749` configurado em `~/.aws/config` (`region=us-east-1`, `output=json`)
  - [x] **AWS Budget** mensal de USD 30 com 4 thresholds (17%/50%/100% ACTUAL + 100% FORECASTED) → `allyssoncsf@gmail.com`
  - [x] IAM Role + Instance Profile `EcommerceEC2SSMRole` (policy `AmazonSSMManagedInstanceCore`) criados e anexados à EC2
  - [x] SSM Session Manager funcional — `session-manager-plugin` v1.2.814.0 em `~/.local/bin/`; sessão interativa validada; `aws ssm send-command` validado end-to-end
  - [x] Security Group `sg-06f620dffedd9008f` hardenizado — ingress `22/tcp ← 0.0.0.0/0` revogado (SSH público fechado; sshd interno preservado)
  - [x] Tags policy aplicada manualmente: `Project=ecommerce-microsservicos`, `ManagedBy=manual` em recursos criados
  - [ ] **Elastic IP** alocado e associado à EC2 (pré-requisito de P0-B2; não alocado nesta sessão)
  - [ ] **EBS volume persistente** para state separado do root (pode ser P0-C5 ou quando primeiro stateful service entrar)
  - [ ] `docs/infra/aws-specs.md` com inventário (instance ID, AMI, EIP, EBS, IAM resources, custo mensal estimado)
- **Dependências:** —
- **Notas de execução:**
  - Tarefa originalmente "Verificar acesso à VPS Hostinger" — reescrita após pivot arquitetural registrado em **ADR-0008** (AWS EC2 efêmera) e **ADR-0009** (SSM Session Manager).
  - Recursos AWS criados manualmente nesta sessão entram com tag `ManagedBy=manual`; serão importados pra state OpenTofu em **P0-D1** (`tofu import`), com a tag mudando para `terraform` no mesmo PR.
  - Chave SSH `loja-microsservicos.pem` movida do diretório do repo para `~/.ssh/` (`chmod 400`); permanece como fallback emergencial caso SSM quebre.

---

## Grupo C — Bootstrap da VPS via Ansible

Sequencial. Depende de B4.

> **Pivot ADR-0008 (2026-05-01):** o "VPS" deste grupo passa a ser a **EC2 da AWS**
> (Amazon Linux 2023, não Ubuntu/Debian). Roles do Ansible vão usar `dnf` em vez de
> `apt`; SELinux ativo por default; usuário inicial `ec2-user` (não `root`). A criação
> do usuário `deploy` (P0-C2) continua válida como prática.
>
> **Conexão Ansible:** SSH público está **fechado** desde **ADR-0009** (SSM Session
> Manager substituiu admin access). Ansible se conecta via `community.aws.aws_ssm` ou
> via SSH-over-SSM (`ProxyCommand` no `~/.ssh/config`). Decisão final fica no PR de
> P0-C1.

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

> **Pivot ADR-0008 (2026-05-01):** firewall a nível de OS (`ufw`) passa a ser
> camada **adicional** sobre os Security Groups da AWS — SG é a fonte de verdade
> da exposição inbound. P0-C3 segue configurando `ufw` como defense in depth
> interno. Portas 80/443 do Traefik precisam estar abertas no Security Group
> antes do P0-D2 rodar (sub-passo do PR de D2).
>
> **OpenTofu agora cobre AWS além de Cloudflare:** P0-D1 expande para incluir
> import dos recursos AWS criados manualmente em P0-B4 (EC2, IAM Role,
> Instance Profile, Security Group, EIP).

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

> **Pivot ADR-0008 (2026-05-01):** auth de deploy muda. **`DEPLOY_SSH_KEY` em
> GitHub Secrets é substituída por OIDC trust** entre GitHub Actions e AWS IAM
> (sem credenciais long-lived em Secrets). P0-F3 vira "configurar OIDC + IAM
> Role para CD"; deploy nas EC2 vai via `aws ssm send-command`
> (`AWS-RunShellScript`) — não SSH direto. Decisão peer cabe em ADR específica
> que nasce no PR de P0-F3.

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
- **Notas:** CodeQL (SAST baseline para TS/JS) já entregue em 2026-04-30 via
  `.github/workflows/codeql.yml` — ver **ADR-0007**. É peça paralela do mesmo Grupo H,
  não substituto: gitleaks-CI cobre padrões de secret que CodeQL e o secret-scanning do
  GitHub não detectam (genéricos, validity-checks são GHAS-only — ver notas de P0-B1).

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
