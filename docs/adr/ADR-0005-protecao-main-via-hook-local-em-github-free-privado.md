# ADR-0005 — Proteção da branch `main` via hook local em GitHub Free privado

- **Status:** superseded by [ADR-0006](ADR-0006-tornar-repo-publico-para-destravar-features-educacionais.md) em 2026-04-30
- **Data:** 2026-04-30
- **Decisores:** Allysson Christopher
- **Tags:** repo, ci-cd, security, contributing

## Contexto

ADR-0003 fixou o modelo de trabalho: trunk-based development com squash merge
único e **branch protection rígida** em `main` (push direto proibido,
histórico linear, sem force push, regras aplicadas inclusive a admin).
Aquela ADR descreveu a regra; o mecanismo de aplicação ficou implícito em
"branch protection do GitHub", que era a única forma de enforcement
server-side discutida.

Ao executar P0-B1 do backlog (configurar repositório no GitHub e branch
protection), descobri uma restrição que invalida parte do plano original:

- O repositório foi criado como **privado** (decisão consciente e atual
  do projeto — sem orçamento explícito; não queremos expor código nessa
  fase).
- O **GitHub Free** **não permite** nem a API clássica de "branch
  protection" nem a API moderna de "Repository Rulesets" em
  **repositórios privados**. As duas exigem GitHub Pro, Team ou
  Enterprise — ou que o repo seja público. Tentativa de aplicar a API
  retornou:

  > "Upgrade to GitHub Pro or make this repository public to enable this
  > feature." (HTTP 403)

- Pesquisa em abril/2026 confirmou: a paywall continua e existe
  discussão pública aberta (`community/discussions/174400`) pedindo que
  a feature seja liberada. Não há previsão.

Forças em jogo:

- O brief é projeto educacional/profissional **sem orçamento**; assinar
  GitHub Pro ($4/mês ≈ R$240/ano) por uma feature que tem alternativa
  razoável é desproporcional na Fase 0.
- Tornar o repo público agora seria reverter uma decisão consciente
  tomada minutos antes desta ADR; má prática como precedente.
- Adiar a proteção até o Grupo F (CI/CD) ou indefinidamente deixaria
  `main` em "honor system" puro — risco real de `git push --force` ou
  push direto acidental, especialmente em sessões com Claude Code onde
  o agente pode "consertar rápido" pulando o ciclo de PR.
- Husky já está instalado e operando (P0-A4); adicionar mais um hook
  custa praticamente nada e segue o padrão local-first do projeto.

Esta ADR escolhe o mecanismo de aplicação compatível com as restrições
descobertas, sem invalidar a política definida em ADR-0003.

## Decisão

**Adotamos um hook `pre-push` do husky em `.husky/pre-push` como mecanismo de aplicação client-side da proteção da `main` definida em ADR-0003, enquanto o repo for privado em GitHub Free.**

Detalhamento:

- **Onde:** `.husky/pre-push`. Versionado no repo. Ativado automaticamente
  pelo `prepare` script do `package.json` na primeira `npm install` da
  máquina.
- **O que bloqueia:** qualquer `git push` cujo `<remote-ref>` seja
  `refs/heads/main`, em qualquer remote. Imprime mensagem explicativa
  no stderr com o fluxo correto (criar branch + abrir PR + squash-merge)
  e sai com código 1.
- **O que NÃO bloqueia:**
  - Push em qualquer outra branch (incluindo force-push em feature
    branches, que é legítimo em rebase pré-PR).
  - Configuração `core.hooksPath` apontando pra outro lugar (responsabilidade
    do dev manter padrão).
- **Bypass conhecido (e aceito):** `git push --no-verify origin main`,
  push de outra máquina sem o repo clonado, chamadas diretas à API do
  GitHub. **Documentado explicitamente** no comentário do hook e em
  `docs/contributing/local-setup.md`. Tratar o hook como **tripwire**,
  não como enforcement.
- **Honestidade no produto:** o hook imprime na própria mensagem de
  bloqueio que existe um caminho de bypass. Esconder não tornaria mais
  seguro — só esconderia.
- **Migração futura:** quando o repo virar público OU subirmos para
  GitHub Pro OU migrarmos para uma org com plano pago, ativamos branch
  protection server-side (ou rulesets) por cima. O hook permanece como
  atalho local que falha **antes** do round-trip à API e pode ser
  removido depois sem dano. Nova ADR vai marcar essa transição.

Esta ADR **não supersede ADR-0003**. ADR-0003 continua válida no que
define a _política_ (squash-only, histórico linear, sem force push em
main, regras valem inclusive pra admin). ADR-0005 define o _mecanismo_
sob a restrição atual.

## Consequências

**Positivas:**

- Política de ADR-0003 fica enforced na prática, mesmo no plano free
  privado, com custo zero e ~10 min de trabalho.
- A primeira vez que o dev (ou Claude Code) tentar `git push origin
main`, o hook explica o erro e mostra o fluxo correto — efeito
  pedagógico, não só repressivo.
- Hook compõe bem com o resto da stack husky existente (pre-commit,
  commit-msg). Manutenção concentrada em um diretório só.
- Migração futura para server-side é aditiva, não destrutiva. Investimento
  preservado.
- Decisão e suas limitações ficam **registradas** — se daqui a 6 meses
  alguém (ou nós mesmos) achar que `main` está "protegida", encontra
  esta ADR e entende exatamente o que está em jogo.

**Negativas / trade-offs aceitos:**

- **Não é proteção real.** Pode ser burlada. O risco principal residual:
  `git push --no-verify origin main` digitado por engano, ou commits
  pushados por automação/CI futura que não use o git local. Mitigação:
  documentação explícita; quando entrarmos no Grupo F, configurar workflows
  do GitHub Actions de forma que NÃO façam push direto em main.
- **Falsa sensação de segurança** em quem só lê CLAUDE.md sem ler esta
  ADR. Mitigação: `local-setup.md` link explícito para esta ADR e o hook
  imprime "ADR-0005" na própria mensagem.
- **Se o `core.hooksPath` for mudado** (ou husky desinstalado), proteção
  some sem aviso. Mitigação: o `prepare` script restaura husky em qualquer
  `npm install`. Ainda assim é frágil.
- **Push de outra máquina** (CI, GitPod, Codespace, ou outro laptop sem
  husky instalado) burla silenciosamente. Mitigação: até que alguma
  dessas máquinas exista, é teórico. Quando existir (provável no Grupo F
  com runners do GitHub Actions), revisar.
- **Divergência entre dev local e GitHub.** Em outros projetos isso é
  remediado por server-side. Aqui não temos. Aceitável conscientemente.

**Neutras / a observar:**

- Volume de "tentativas de push em main" é uma proxy razoável para
  saber se o fluxo de PR está sendo respeitado. Não há instrumentação,
  mas se a mensagem do hook aparecer com frequência, é sinal de hábito
  ainda não formado.
- O hook adiciona ~50ms ao tempo de cada `git push` em qualquer branch.
  Imperceptível em fluxo solo.

## Alternativas consideradas

- **Tornar o repo público** — descartada agora. Resolveria com proteção
  server-side completa e gratuita, mas reverteria uma decisão consciente
  de privado tomada poucos minutos antes desta ADR. Mudança emocional sob
  pressão técnica é mau precedente. Reavaliar quando o projeto estiver
  estável e quisermos abrir o aprendizado.
- **Assinar GitHub Pro ($4/mês)** — descartada para a Fase 0. Resolve
  100% server-side, mas introduz despesa recorrente em projeto sem
  orçamento. Reavaliar quando houver justificativa concreta (mais
  features pagas como SAML, advanced security, ou simplesmente decisão
  consciente de pagar).
- **Adiar branch protection completamente** — descartada. ADR-0003 fixou
  proteção como invariante do fluxo, e existe risco real de `--force` ou
  push direto acidental durante 5+ semanas até o Grupo F. O custo de
  implementar o hook é menor que esse risco.
- **Migrar para GitLab/Bitbucket/Gitea self-hosted** — descartada.
  Trocar de plataforma para resolver uma feature paga é overkill;
  perderíamos o ecossistema GitHub Actions, ghcr, dependabot/renovate
  etc. Custo de migração orders of magnitude maior que o ganho.
- **Escrever um GitHub Action que falha PRs com commits diretos em main**
  — descartada. Funciona como detecção _post-hoc_, não como prevenção.
  Se o push direto já aconteceu, a `main` já foi alterada.
- **Pre-receive hook server-side via webhook + serviço próprio** —
  descartada. Tecnicamente possível (webhook → backend que faz
  rollback), mas absurdamente complexo para o ganho. Útil em Enterprise
  Server, não em Cloud free.

## Referências

- ADR-0003 (Trunk-based development com squash merge — política que esta
  ADR aplica)
- `PROJECT_BRIEF.md` §5.2 (Modelo de branching e fluxo de PR)
- `docs/backlog/phase-0.md` P0-B1
- `docs/contributing/local-setup.md` §"Sobre o pre-push hook"
- `.husky/pre-push` (a implementação)
- [GitHub: About protected branches — disponibilidade por plano](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub: About rulesets — disponibilidade por plano](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Community Discussion #174400 — pedido público pra liberar branch protection em privados free](https://github.com/orgs/community/discussions/174400)
