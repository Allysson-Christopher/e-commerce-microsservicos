# ADR-0007 — Adotar CodeQL como SAST baseline (escopo TypeScript/JavaScript)

- **Status:** accepted
- **Data:** 2026-04-30
- **Decisores:** Allysson Christopher
- **Tags:** ci-cd, security, devsecops

## Contexto

O cutover do repo para público (ADR-0006) destrava **CodeQL gratuito** em
GitHub Actions. O backlog Fase 0 lista, no Grupo H (segurança baseline e
qualidade), a aspiração de uma camada SAST como parte do "DevSecOps stack"
descrito em `PROJECT_BRIEF.md` §6.3 — que nomeia tanto **Semgrep** quanto
**CodeQL** como candidatos. P0-H2 cobre apenas gitleaks no CI; SAST de
código de aplicação não tem tarefa dedicada hoje, mas faz parte do plano.

Estado atual do repo: zero código de produto. O único arquivo TS/JS é
`commitlint.config.js`. Frontend (Next.js) e serviços Node/NestJS aparecem
só na Fase 1. Esperar até lá pra ligar SAST significa escrever código com
janela exposta de N semanas; ligar agora cria infra dormente que valida
sozinha quando o primeiro arquivo de produto entrar.

Forças em jogo:

- Brief §0.1 estabelece pentest mindset e OWASP Top 10 como checklist —
  SAST detectivo desde dia 1 reforça a postura.
- Brief §6.3 lista Semgrep e CodeQL; um não exclui o outro, mas há
  sobreposição (~50%) e custo de manter ambos é alto pra solo dev.
- CodeQL é GitHub-native: zero config externa, zero secret extra, zero
  infra; Semgrep precisa de token, ruleset custom e CI minutes que
  consome de forma diferente.
- Repo público ⇒ minutos ilimitados em runners hospedados (cf. ADR-0006).
- Java e Go ainda não existem no repo; CodeQL para essas linguagens exige
  toolchain de build (Maven/Go) instalada, e `autobuild` falharia hoje.

## Decisão

**Adotamos CodeQL como SAST baseline do projeto, com escopo inicial restrito
a `javascript-typescript`, via workflow `.github/workflows/codeql.yml`.**

Detalhes:

- **Linguagem:** somente `javascript-typescript`. Java e Go nascerão com o
  primeiro serviço de cada linguagem (cada um com ADR própria; ver lista
  de candidatas em `docs/adr/README.md`).
- **Query suite:** `security-extended` (não `default`, não
  `security-and-quality`). Ver "Alternativas consideradas".
- **Triggers:**
  - `push` em `main` filtrado por paths TS/JS/JSX/TSX/CJS/MJS,
    `package.json`, `package-lock.json` e o próprio
    `.github/workflows/codeql.yml`.
  - `pull_request` em `main` com mesmo path filter.
  - `schedule` semanal (`0 6 * * 1` — segunda 06:00 UTC = 03:00 BRT,
    off-peak), **sem** path filter (eventos `schedule` no GitHub Actions
    ignoram paths por design — desejado, pra capturar drift de novas
    queries publicadas pela GitHub).
- **Concurrency:** `codeql-${{ github.ref }}`; cancela runs in-progress
  apenas em PRs (não cancela pushes em `main` nem cron).
- **Permissões mínimas:** `actions: read`, `contents: read`,
  `security-events: write`.
- **Pinning:** `github/codeql-action@v3.35.2` (release de 2026-04-15) e
  `actions/checkout@v4`. Renovate (P0-H4) gerenciará bumps. SHA pinning é
  hardening pra pass futura.
- **Posição ante Semgrep:** Semgrep não é descartado, fica adiado para
  ADR posterior caso surja gap concreto que CodeQL não cubra. Manter os
  dois em paralelo só se houver razão clara — sobreposição ~50% torna o
  custo desproporcional pra solo dev.

Esta ADR **não cobre**: Trivy (container), Checkov (IaC), gitleaks (secrets
em CI — P0-H2 mantém), SonarCloud (quality — P0-H5), Renovate (deps —
P0-H4). Cada um tem ADR/tarefa próprias.

## Consequências

**Positivas:**

- Camada SAST detectiva ativa antes de o primeiro código de produto entrar
  — coerente com o pentest mindset do brief §0.1.
- Resultados aparecem em **Security → Code scanning** do GitHub, mesma UI
  consolidada onde Dependabot e Secret Scanning já reportam. Triagem
  unificada.
- Infra dormente: primeira run vai escanear ~1 arquivo de tooling
  (`commitlint.config.js`) e provavelmente reportar 0 alertas. Quando
  frontend/Node services nascerem, escaneamento já roda desde o primeiro
  PR — sem PR de "ativação de segurança" depois.
- Cron semanal pega **drift de queries**: GitHub atualiza o ruleset CodeQL
  continuamente; sem o cron, novas queries só seriam aplicadas no próximo
  PR de TS/JS, que pode demorar semanas.
- Path filter mantém o custo de PR baixo: PRs em Java/Go/IaC/docs **não**
  disparam CodeQL.

**Negativas / trade-offs aceitos:**

- Java e Go ficam fora — vulnerabilidades nessas linguagens só serão
  detectadas pelo CodeQL quando os respectivos serviços nascerem (cada um
  com ADR dedicada que estende este workflow). Risco mitigado: até o
  primeiro serviço Java/Go existir, não há código produtivo nessas
  linguagens.
- `security-extended` tem FP rate maior que `default`. Solo dev tolera; em
  time exigiria triagem dedicada. Se o ruído ficar inviável, downgrade
  pra `default` é trivial e cabe em ADR de revisão.
- Pinning em tag `v3.35.2` (não SHA) aceita risco residual de tag-rewrite
  attack contra `github/codeql-action`. Mitigação: action é
  GitHub-própria; superfície de comprometimento exige ataque ao próprio
  GitHub. Hardening pra SHA fica registrado como pass futura.
- Run agendada semanal consome CI minutes mesmo quando nada mudou —
  trade-off aceito (público free = ilimitado; custo monetário zero).

**Neutras / a observar:**

- `security_and_analysis.code_scanning_default_setup` no estado do repo
  permanece desabilitado (não ligamos via Settings UI; o workflow YAML
  controla tudo). Manter assim — "default setup" e "advanced setup"
  conflitam.
- Métricas de FP / TP a observar nas primeiras runs com código real
  (Fase 1).

## Alternativas consideradas

- **Semgrep como SAST primário em vez de CodeQL** — adiada. Brief lista os
  dois; CodeQL ganha por integração GitHub-native e zero infra extra. Se
  Semgrep for adicionado depois, vira ADR própria com a justificativa do
  gap concreto.
- **Query suite `default`** — descartada. Cobertura de segurança menor;
  brief pede pentest mindset, vale aceitar mais FP por mais TP.
- **Query suite `security-and-quality`** — descartada. Adiciona queries de
  manutenibilidade que estouram ruído em código embrionário; SonarCloud
  (P0-H5) cobre quality gate.
- **Habilitar todas as linguagens (`java`, `go`, `javascript-typescript`)
  já neste PR** — descartada. CodeQL precisa de toolchain de build pra
  Java/Go (`autobuild` não funciona sem Maven/Go); rodaria com erro
  permanente até o primeiro serviço da linguagem nascer. Cada linguagem
  entra com seu serviço.
- **Cron sem triggers de push/PR (apenas semanal)** — descartada. PRs com
  regressão de segurança chegariam no `main` e só seriam detectados na
  segunda-feira seguinte; latência alta demais pra pegar erro perto do
  ponto de introdução.
- **Sem path filter (rodar em tudo)** — descartada. PRs de docs/IaC/Ansible
  disparariam CodeQL desnecessariamente, queimando minutos e atrasando o
  feedback de PR.
- **Pinar action a commit SHA** — adiada. Tag `v3.35.2` é razoável para
  action GitHub-própria; Renovate gerencia upgrades. Hardening para SHA
  vira pass futura no Grupo H.
- **Habilitar via "Default setup" do Settings → Code scanning** —
  descartada. Default setup é UI-driven, não versionado, conflita com
  workflow YAML, e não permite tunning fino (queries, paths, cron). YAML
  é a fonte da verdade do repo.

## Referências

- ADR-0006 (cutover público destrava CodeQL grátis)
- `PROJECT_BRIEF.md` §0.1 (segurança como prioridade), §6.3 (DevSecOps stack)
- `docs/backlog/phase-0.md` P0-H2 (gitleaks no CI — peça paralela)
- `.github/workflows/codeql.yml` (este PR)
- [CodeQL Action](https://github.com/github/codeql-action)
- [Code scanning docs](https://docs.github.com/en/code-security/code-scanning)
- [Hardening for GitHub Actions — pinning third-party actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
