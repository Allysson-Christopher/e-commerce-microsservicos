# ADR-0002 — Conventional Commits com scope obrigatório e body-required-when-typed

- **Status:** accepted
- **Data:** 2026-04-29
- **Decisores:** Allysson Christopher
- **Tags:** repo, ci, processo, contributing

## Contexto

Este projeto é construído por dev solo em colaboração com Claude Code, em
sessões com horizonte longo (6-9 meses, 6 fases). Entre sessões, o `git log`
é a principal fonte de contexto que sobrevive — quando uma sessão futura
abre o repo, ela lê o log antes de assumir o que o estado atual significa.

Isso impõe uma exigência incomum sobre commits: cada mensagem é consumida
por LLMs e por humanos como **memorando institucional**. Mensagens vagas
("update", "fix bug", "wip") apagam contexto que vai custar caro reconstruir.

Restrições adicionais:

- Monorepo (ADR-0001) com 10+ serviços ao final — sem indicação de qual
  serviço foi afetado, fica difícil triagem visual do log.
- Versionamento independente por serviço com release-please (ADR-0004) exige
  um `scope` confiável para encaminhar commits ao package correto.
- Body livre permite repetir o `git diff` em prosa, o que é pior que nada
  — precisamos de regra que force o WHY sem virar burocracia em commits
  triviais.
- Solo dev: regra precisa rodar **localmente antes do push** e ser validada
  no CI; não há revisor humano que vai pegar a mensagem ruim.

Esta decisão fixa o formato de mensagens de commit do projeto e como ele é
mecanicamente forçado.

## Decisão

**Adotamos Conventional Commits 1.0.0 com duas extensões obrigatórias deste repo: scope enumerado e body obrigatório para tipos que registram decisão ou comportamento.**

Detalhamento:

- **Formato base:** Conventional Commits 1.0.0 (`<type>(<scope>): <subject>`).
- **Scope obrigatório e enumerado** em `commitlint.config.js`. Lista inicial
  cobre serviços (`hello-service`, ...) e áreas do monorepo (`repo`, `deps`,
  `ci`, `docs`, `infra`, `contracts`, `frontend`, `observability`, `security`,
  `release`). Adicionar scope é mudança consciente de config — não silenciosa.
- **Plugin custom `body-required-when-typed`** (em `commitlint.config.js`)
  exige body com mínimo de 50 caracteres para `feat`, `fix`, `refactor`,
  `perf` e qualquer commit marcado como breaking change (`!` após
  type/scope). `chore`, `docs`, `style`, `ci`, `build`, `test` ficam livres
  para subject sozinho quando triviais.
- **Footer estruturado** (opcional mas padronizado): `Refs: ADR-XXXX, ...`,
  `Closes: #N`, `BREAKING CHANGE: <descrição>`, `Co-Authored-By: <modelo>`.
- **Validação em duas camadas:**
  - Local: `husky` hook `commit-msg` rodando `commitlint` (fail-closed; o
    commit não acontece se a mensagem violar regra).
  - CI: job `commitlint` em PR validando todos os commits da branch.
- **Sem `--no-verify`** — bypass do hook é considerado violação. Se a regra
  está bloqueando algo legítimo, ajusta-se a regra com ADR de revisão.
- **Política de redação detalhada** em `CLAUDE.md` (§"Commit messages") e
  `docs/contributing/commits.md` — a config mecânica pega o esqueleto, a
  política pega a substância (WHY explícito, citar ADRs/§ do brief, mencionar
  alternativas rejeitadas, evitar redescrever o diff).

Implementado em P0-A4 (commits `9cf0054`, `79b99ec`).

## Consequências

**Positivas:**

- `git log --oneline` lista commits no formato `feat(payment-service): ...`,
  imediatamente filtrável por serviço (`git log --grep '(payment-service)'`).
- release-please consegue rotear commits para o package correto pela leitura
  do scope (viabiliza ADR-0004).
- Body obrigatório força registro de WHY em mudanças que importam (decisões,
  bugs, refactors, perf), enquanto chore/docs/style ficam leves.
- Plugin custom é simples (~30 linhas em `commitlint.config.js`), sem
  dependência externa adicional.
- Hook fail-closed evita "vou consertar a mensagem depois" — comum em fluxo
  solo, problemático para LLMs em sessões futuras.

**Negativas / trade-offs aceitos:**

- Curva de adaptação para escrever body útil — o linter aceita 50 chars de
  qualquer coisa, então a qualidade depende de disciplina. Mitigação:
  política de redação em `CLAUDE.md` e exemplos em `docs/contributing/commits.md`.
- Adicionar serviço novo exige PR no `commitlint.config.js` antes do
  primeiro commit do serviço. Aceitável: força reflexão sobre nomenclatura
  do scope antes de espalhar.
- `chore`/`docs` ficam tecnicamente livres mesmo quando carregam decisão
  (ex.: `chore(repo): switch from npm to pnpm`). Mitigação: `CLAUDE.md`
  documenta que body volta a ser obrigatório por princípio nesses casos
  — mas não é mecanicamente forçado.
- `husky` adiciona 1 dep dev e setup em `prepare` script. Custo baixo,
  benefício alto.

**Neutras / a observar:**

- Qualidade real do body depende de disciplina humana + LLM, não do linter.
  Se os bodies degradarem, aumentar `MIN_BODY_CHARS` ou adicionar regra de
  "deve conter referência ADR/§/runbook" em commits feat/refactor.
- A lista de scopes vai crescer ~12 itens conforme serviços nascem. Manter
  a curadoria; não permitir scope free-form via `scope-enum: [0]`.

## Alternativas consideradas

- **Conventional Commits sem extensões** (apenas o spec base) — descartada.
  Spec permite scope livre/ausente e não exige body. Atende formato, não
  atende a função de "memorando institucional".
- **Gitmoji ou estilo livre** — descartada. Sem estrutura mecânica, não dá
  para automatizar release-please nem filtrar por serviço.
- **commit-msg via script shell custom** (sem commitlint) — descartada.
  commitlint já tem o ecossistema Conventional Commits, plugins e
  integrações. Reescrever em shell é trabalho sem ganho.
- **Body obrigatório em TODOS os tipos** — descartada. Vira ruído em
  bumps de patch, formatação automática e correções de typo. Comprometeria
  a legitimidade da regra ("se até para um typo eu preciso explicar, vou
  acabar fugindo dela").
- **Husky v8 + lint-staged + commitizen interativo** — `commitizen`
  descartado. Útil para times grandes que tropeçam no formato; em fluxo
  solo+LLM é overhead. Claude Code escreve no formato direto.
- **`--no-verify` como escape válido** — explicitamente descartada. Bypass
  fácil = regra opcional na prática; vira "às vezes a gente segue".

## Referências

- `PROJECT_BRIEF.md` §5.1 (Versionamento e Conventional Commits)
- `CLAUDE.md` §"Commit messages — leia antes de commitar"
- `docs/contributing/commits.md` (guia completo + exemplos)
- `commitlint.config.js` (regras + plugin `body-required-when-typed`)
- ADR-0001 (Monorepo único poliglota — motiva scope obrigatório)
- ADR-0004 (Versionamento independente por serviço — depende do scope)
- `docs/backlog/phase-0.md` P0-A4
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
