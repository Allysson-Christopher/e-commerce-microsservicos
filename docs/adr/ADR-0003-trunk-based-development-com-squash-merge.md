# ADR-0003 — Trunk-based development com squash merge

- **Status:** accepted
- **Data:** 2026-04-29
- **Decisores:** Allysson Christopher
- **Tags:** repo, ci-cd, processo, contributing

## Contexto

O projeto é solo, monorepo (ADR-0001) com versionamento independente por
serviço (ADR-0004) e CD que dispara em push na `main` (staging) e em
release publicado (prod). O fluxo de branches precisa:

- Suportar **CI verde como gate** (sem merge se CI falhar) — protege a
  capacidade de redeploy a qualquer momento.
- Manter `main` **sempre deployable** — push em `main` = deploy automático
  em staging.
- Gerar histórico **legível por LLMs e por release-please** (ADR-0002 + 0004
  exigem 1 mensagem clara por mudança lógica, com scope confiável).
- Permitir **mergear código incompleto sem expor ao usuário** (feature
  flags) — viabiliza CI real (mergea cedo e frequente) sem GitFlow.

Forças adicionais:

- Solo dev: GitFlow, com `develop`/`release/*`/`hotfix/*`, é cerimonial sem
  benefício. Ninguém vai "estabilizar a release" coletivamente.
- LLM coda mais rápido que o ciclo manual de revisão; PRs podem virar
  acumulados se o modelo for de branch longa. Branches longas em monorepo
  = conflitos crescentes em arquivos partilhados (`commitlint.config.js`,
  `package.json`, `infra/...`).

Esta decisão fixa o modelo de branching, o tipo de merge e as regras de
proteção da branch principal.

## Decisão

**Adotamos trunk-based development com branches de feature curtas (≤ 1-2 dias), squash merge único como estratégia de merge, e proteção rígida na `main`.**

Detalhamento:

- **Branch principal única:** `main`. Sempre deployable em staging via CD
  automático.
- **Sem `develop`, sem `release/*`, sem `hotfix/*`** — GitFlow rejeitado.
- **Branches de feature curtas:**
  - `feat/<service>-<short-desc>`
  - `fix/<service>-<short-desc>`
  - `chore/<desc>`, `docs/<desc>`, `refactor/<service>-<desc>`
- **Apenas squash merge habilitado** no GitHub. Sem merge commit, sem
  rebase merge. Histórico linear na `main`.
- **Squash usa o título do PR como mensagem do commit final** — o título do
  PR precisa ser uma Conventional Commit válida (commitlint valida no CI;
  ver ADR-0002).
- **Branch protection em `main`:**
  - Push direto proibido (mesmo para o próprio dono).
  - PR obrigatório.
  - Required status checks: CI (lint + test + build) + commitlint.
  - Histórico linear obrigatório.
  - Sem force push.
  - **Auto-merge habilitado** — PR mergeia sozinho quando CI fica verde.
- **Self-review do diff antes de mergear** (exercício didático): mesmo
  solo, ler o próprio PR como se fosse de outro, antes do merge.
- **Feature flags como mecanismo de "merge ≠ release"** — código incompleto
  fica atrás de flag desligada. Ferramenta específica de feature flag
  (Unleash, GrowthBook, ConfigCat ou caseira) será decidida em ADR
  separada quando o primeiro caso real aparecer.

## Consequências

**Positivas:**

- `git log` linear, fácil de bisectar e de ler em sessões futuras.
- Squash força que **um PR = uma unidade lógica** com mensagem útil — "wip",
  "fix typo", "address review" desaparecem do histórico permanente.
- Branches curtas reduzem conflitos cross-service no monorepo.
- Branch protection mesmo em projeto solo é **contrato com você mesmo**:
  exercita disciplina e permite que sessões futuras de Claude Code
  presumam que `main` é confiável.
- CI verde como gate protege a invariante "push em `main` = deploy em
  staging em <5 min" (critério do marco 0.1).
- Auto-merge alinha com fluxo solo+LLM: gerador de PR não bloqueia
  esperando humano apertar "merge" depois do CI verde.

**Negativas / trade-offs aceitos:**

- Squash perde commits granulares da branch — dificulta investigação fina
  ("quando exatamente esse arquivo mudou?"). Mitigação: a branch original
  fica em `gh pr list --state merged` por enquanto, e o body do PR pode
  citar mudanças intermediárias quando relevante.
- Feature flags adicionam complexidade no código. Aceitável: é o preço
  para CI real sem GitFlow.
- Sem `release/*` para "estabilização": o que vai a prod é o que está em
  `main` no momento da tag de release. Mitigação: release-please (ADR-0004)
  abre PR de release explícito; aprovação do PR é o gate humano.
- Não exercita workflows de revisão coletiva — exercício adiado para se/quando
  outro dev entrar.

**Neutras / a observar:**

- Auto-merge presume CI confiável. Se a flakiness aumentar, desligar
  auto-merge antes de "merge para tirar do caminho".
- Se PRs começarem a ficar longos (>2 dias) por conta de tarefas grandes,
  quebrar a tarefa do backlog em sub-tarefas menores — não relaxar o
  modelo.

## Alternativas consideradas

- **GitFlow** (`develop` + `release/*` + `hotfix/*`) — descartado.
  Cerimonial sem time, e branches longas em monorepo geram conflitos.
- **GitHub Flow puro** (PR direto em `main` sem squash forçado) — quase
  adotado. Descartado em favor de squash forçado para garantir histórico
  linear e mensagens consolidadas (essenciais para release-please).
- **Rebase merge** — descartado. Mantém commits granulares ("wip", "fix
  review") na `main`, polui o histórico que LLMs e humanos vão consumir.
- **Trunk-based sem branch protection** — descartado. Em projeto solo é
  fácil "só fazer push direto" e quebrar a invariante de CI verde. A regra
  precisa ser mecânica, não voluntária.
- **Stacked PRs (Graphite, Sapling)** — descartado para a Fase 0. Útil em
  cadeias de PRs dependentes; em fluxo solo com PRs curtos não justifica
  ferramenta extra. Reavaliar se o padrão se repetir.

## Referências

- `PROJECT_BRIEF.md` §5.2 (Modelo de branching e fluxo de PR)
- ADR-0001 (Monorepo único poliglota)
- ADR-0002 (Conventional Commits com scope obrigatório — exigência de título
  de PR válido para squash)
- ADR-0004 (Versionamento independente por serviço com release-please —
  consome o histórico linear gerado por squash)
- `docs/backlog/phase-0.md` P0-B1 (configuração de branch protection no GitHub)
