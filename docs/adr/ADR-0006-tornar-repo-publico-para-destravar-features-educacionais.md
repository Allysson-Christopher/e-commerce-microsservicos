# ADR-0006 — Tornar repo público para destravar features educacionais e ativar branch protection server-side

- **Status:** accepted
- **Data:** 2026-04-30
- **Decisores:** Allysson Christopher
- **Tags:** repo, ci-cd, security, contributing
- **Supersedes:** [ADR-0005](ADR-0005-protecao-main-via-hook-local-em-github-free-privado.md)

## Contexto

O brief é projeto **educacional/profissional** com foco explícito em DevOps e
segurança com pentest mindset (§0.1). Várias features que o backlog da Fase 0
planeja exercitar — branch protection, auto-merge, required reviewers em
environments, SonarCloud, CI minutes amplos — **não funcionam em repos
privados no GitHub Free**.

Durante a execução de P0-B1 em 2026-04-30, descobrimos cumulativamente três
manifestações da mesma paywall:

| Feature                            | Manifestação                                           |
| ---------------------------------- | ------------------------------------------------------ |
| Branch protection / Rulesets       | HTTP 403 explícito                                     |
| Auto-merge                         | API aceita PATCH mas mantém `false` (silently ignored) |
| Required reviewers em Environments | HTTP 422 explícito                                     |

ADR-0005 escolheu **adaptar com hook client-side** (`.husky/pre-push`) como
fallback para a primeira (branch protection) enquanto o repo era privado em
plano free, aceitando o trade-off de "tripwire, não enforcement real". As
outras duas (auto-merge, required reviewers) ficaram registradas como
adiadas até migração de plano.

À medida que P0-B1 avançou, ficou claro que a estratégia "adaptar dentro do
gratuito privado" cobre cada vez menos do plano original — todo serviço
adicionado nas próximas fases (Grupo F: CI; Grupo H: Renovate, SonarCloud,
Trivy, Checkov) vai bater nas mesmas paywalls.

Forças em jogo:

- Projeto é educacional; aprendizado das features é o ponto, não detalhe.
- Histórico atual (14 commits, ~24h de trabalho) é todo de bootstrap —
  nada confidencial. Brief, ADRs, backlog são planejamento aberto.
- Tornar público é **irreversível na prática**: bots indexam novos repos
  públicos em segundos; reverter pra privado depois não desfaz a
  exposição.
- Custo do alternativo (GitHub Pro) é $48/ano sem benefício educacional
  adicional além das features — preço cumulativo do "manter privado a
  qualquer custo".
- Email do dev no `git log` aparece publicamente; mitigável com noreply
  (configurável daqui pra frente, sem reescrever histórico).

## Decisão

**Tornamos o repositório público para destravar branch protection, auto-merge, required reviewers em environments, e demais features educacionais que o GitHub Free reserva a repos públicos. Ativamos branch protection server-side em `main` e removemos o hook client-side (ADR-0005), agora redundante.**

Detalhamento do cutover (executado em 2026-04-30):

- **Visibilidade:** `private` → `public` via `gh api -X PATCH .../e-commerce-microsservicos -f visibility=public`. (A flag `gh repo edit --visibility public --accept-visibility-change-consequences` exige gh CLI ≥ 2.50; usamos a API direta porque a versão local é 2.45.)
- **Email no git local:** trocado pra `128186654+Allysson-Christopher@users.noreply.github.com` (escopo: este repo). Histórico **não foi reescrito** — commits anteriores mantêm o email original. Daqui pra frente, todo commit usa noreply.
- **Branch protection em `main`:** aplicada com `required_linear_history=true`, `enforce_admins=true`, `allow_force_pushes=false`, `allow_deletions=false`. `required_status_checks=null` (pendente até Grupo F entregar workflows).
- **Auto-merge:** habilitado (`allow_auto_merge=true`).
- **Required reviewer em `production` environment:** Allysson-Christopher (id 128186654) — simula o "approval gate" do DoD original de P0-B1.
- **Hook `.husky/pre-push`:** removido. Server-side cobre a regra com mais robustez (vale para pushes de qualquer máquina, runners de CI, chamadas API). ADR-0005 marcada como superseded.

Esta ADR **não revoga ADR-0003** (política trunk-based + squash-only +
sem force push em main). Apenas troca o **mecanismo** de enforcement de
client-side (ADR-0005, hook) para server-side (branch protection do
GitHub). A política em si segue idêntica.

## Consequências

**Positivas:**

- **Branch protection server-side ativa** em `main` — push direto, force push,
  delete da branch e bypass de admin todos bloqueados pelo GitHub, não por
  husky. Vale pra qualquer cliente git (CI, web, outras máquinas).
- **Auto-merge habilitado** — quando workflows de CI chegarem (Grupo F),
  poderemos marcar PRs pra mesclar sozinhos quando o CI passar.
- **Required reviewer em `production`** — deploy em prod (planejado pro
  Grupo F via release tag) vai exigir aprovação manual antes de rodar.
- **SonarCloud free tier funciona** — desbloqueia P0-H5.
- **CI minutes ilimitados** em runners hospedados pelo GitHub (eram 2000/mês
  em privado free).
- **Dependabot security alerts e Code Scanning (CodeQL)** ficam grátis.
- **Hook removido** simplifica o stack de pre-commit: server-side é mais
  robusto e não pode ser burlado com `--no-verify`.
- **Valor de portfolio**: projeto educacional público vira artefato citável
  em currículo / processos seletivos.

**Negativas / trade-offs aceitos:**

- **Histórico irreversível**: 14 commits, brief, ADRs, backlog ficam
  públicos pra sempre. Bots indexam em segundos; reverter pra privado depois
  não desfaz. Aceito conscientemente: nada confidencial está commitado.
- **Email do dev exposto** nos 14 commits anteriores ao cutover (gmail).
  Mitigado parcialmente: noreply configurado pra commits futuros; não vamos
  reescrever histórico (operação destrutiva, não vale o ganho marginal).
- **Superfície aumentada pra spam/issues abusivos** — pode-se fechar Issues
  ou exigir Discussions; por ora deixamos defaults e revisamos se ruído
  aparecer.
- **Push acidental de `.env` ou secret real** vira incidente público
  imediatamente — a janela entre commit e detecção já existia, mas o
  blast radius cresce. Mitigado: gitleaks no pre-commit já está ativo;
  P0-H2 vai adicionar gitleaks no CI; futuro Code Scanning ajuda.
- **Atenção a fork/clone**: qualquer pessoa pode forkear. Não conseguem
  pushar pra este repo, mas mantém cópia do histórico permanentemente.
- **Decisão consciente de privado tomada na criação do repo** foi revertida.
  ADR-0005 documenta o raciocínio sob a restrição original; ADR-0006
  documenta a mudança de prioridade (aprendizado > privacidade).

**Neutras / a observar:**

- Issues, Discussions, Wiki, Pages, Projects: defaults do GitHub valem.
  Reavaliar se necessário.
- "Topics" no repo: ainda não configurados; pode adicionar `microservices`,
  `devops`, `learning`, `monorepo` etc. pra discovery futuro. Tarefa
  cosmética, sem urgência.

## Alternativas consideradas

- **Continuar privado, manter ADR-0005 como mecanismo permanente** —
  descartada. Adia pelo menos branch protection e auto-merge. Required
  reviewers nem teria substituto razoável. Cada nova fase reabre a
  pergunta "como adaptar X?" — custo cumulativo alto.
- **Assinar GitHub Pro ($4/mês)** — descartada. Resolve as paywalls
  sem expor código, mas:
  1. Custo recorrente em projeto sem orçamento;
  2. Não traz o ganho de portfolio do público;
  3. SonarCloud free continua exigindo público mesmo em Pro.
- **Migrar para GitLab/Gitea self-hosted** — descartada. Gratuito e privado
  com features completas, mas perde o ecossistema GitHub Actions, GHCR,
  Renovate, Dependabot, Code Scanning, SonarCloud-via-GitHub-app. Custo
  de migração inviável.
- **Tornar público apenas seletivamente** (criar repo público "espelho"
  com subset do código) — descartada. Overhead enorme para benefício marginal;
  duplica fonte da verdade.
- **Reescrever histórico (`git filter-repo`) pra trocar email do gmail
  pra noreply antes de tornar público** — descartada. Operação
  destrutiva (todos os SHAs mudam), os 14 commits são de planejamento
  sem dados pessoais sensíveis além do email já público no perfil
  GitHub do autor. Custo > ganho.

## Referências

- ADR-0003 (política trunk-based + squash — esta ADR mantém intacta)
- ADR-0005 (mecanismo client-side, agora superseded)
- `PROJECT_BRIEF.md` §0.1 (segurança como prioridade), §5.2 (modelo de branching)
- `docs/backlog/phase-0.md` P0-B1
- [GitHub Docs — About protected branches (disponibilidade por plano)](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Docs — About rulesets (disponibilidade por plano)](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub Docs — Setting commit email address (noreply)](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address)
- Cutover commands executados em 2026-04-30 (visibilidade, branch protection, auto-merge, required reviewer em production)
