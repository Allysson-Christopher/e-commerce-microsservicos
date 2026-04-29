# ADR-0004 — Versionamento independente por serviço com release-please

- **Status:** accepted
- **Data:** 2026-04-29
- **Decisores:** Allysson Christopher
- **Tags:** ci-cd, release, repo, contributing

## Contexto

O projeto é um **conjunto de microsserviços com ciclos de release distintos**,
hospedados em monorepo único (ADR-0001). Cada serviço pode evoluir em ritmo
próprio: `payment-service` pode receber 3 patches enquanto `catalog-service`
fica estável por semanas. Forçar todos a compartilhar um número de versão
("plataforma v1.4.2") apaga essa realidade e cria fricção real:

- Bump cosmético em todos os serviços só porque um deles teve patch.
- "O que mudou na v1.4.2?" vira pergunta sem resposta clara — há changelogs
  de 12 origens diferentes a consolidar.
- release-train mensal congela features prontas esperando o calendário.

Forças adicionais:

- Conventional Commits com scope obrigatório (ADR-0002) já identifica o
  serviço afetado em cada commit — a infra de versionamento precisa
  consumir essa informação.
- Trunk-based com squash merge (ADR-0003) entrega histórico linear,
  consumível por automação.
- Imagens Docker em GHCR precisam de tag explícita por versão; nunca
  deployar `latest` em prod (PROJECT_BRIEF.md §5.1).
- Cada release dispara CD automático (push em `main` → staging; release
  publicado → prod com aprovação).

Esta decisão fixa quem decide a versão de cada serviço, como changelogs e
tags são gerados, e qual ferramenta automatiza isso.

## Decisão

**Adotamos versionamento independente por serviço (SemVer, `0.x.y` durante desenvolvimento) com release-please em modo monorepo gerenciando 1 PR de release por serviço.**

Detalhamento:

- **SemVer por serviço.** Cada serviço tem changelog, tags e versão próprios.
  Promoção a `1.0.0` é decisão consciente por serviço quando estabilidade
  da API justificar.
- **Tag Git:** `<service>-v<X.Y.Z>` (ex.: `order-service-v1.3.0`,
  `catalog-service-v0.8.2`). Formato nativo do release-please em monorepo.
- **Imagem Docker:** `ghcr.io/<owner>/<service>:<X.Y.Z>` + `:latest` (latest
  apenas para conveniência local; **nunca** em prod).
- **release-please em modo monorepo** (`googleapis/release-please-action`):
  - `release-please-config.json` lista todos os packages — 1 entry por serviço.
  - `.release-please-manifest.json` mantém versão atual por package.
  - Workflow `release-please.yml` roda em push na `main`; abre **1 PR por
    serviço** quando há commits Conventional Commits desde a última tag
    daquele serviço.
- **Roteamento por scope:** o scope obrigatório dos commits (ADR-0002,
  ex.: `feat(order-service): ...`) é o que indica ao release-please qual
  package atualizar. Commits com scope `repo`, `deps`, `ci`, `docs`, `infra`
  etc. **não disparam release** de nenhum serviço.
- **Múltiplos serviços num único commit é evitado** — preferir commits
  separados por scope. Garantia: `git log` mostra 1 mudança lógica por commit
  → release-please roteia corretamente.
- **Endpoint `/version`** em cada serviço retorna `{ service, version,
commit, builtAt }` para tornar visível qual versão está em runtime
  (PROJECT_BRIEF.md §5.1).
- **Ciclo do release:**
  1. Commits Conventional na `main` com scope do serviço.
  2. release-please abre PR de release com bump SemVer + changelog gerado.
  3. Merge do PR → cria tag `<service>-vX.Y.Z` → cria GitHub Release.
  4. Release publicado dispara workflow `cd-prod.yml` daquele serviço (com
     manual approval no environment `production`).

## Consequências

**Positivas:**

- Cada serviço evolui no seu próprio ritmo sem fricção cosmética.
- Changelogs por serviço são úteis e focados (não ruído consolidado de 12
  origens).
- Releases em prod são granulares: rollback de `payment-service` não
  derruba os outros.
- release-please automatiza changelog + bump SemVer + tag + GitHub Release
  consumindo Conventional Commits — não há "esqueci de bumpar a versão"
  manual.
- Endpoint `/version` em runtime fecha o ciclo (build → tag → imagem →
  deploy → conferência fácil).
- Casamento limpo com ADR-0001 (monorepo) e ADR-0002 (scope obrigatório):
  cada peça serve a próxima.

**Negativas / trade-offs aceitos:**

- 12 PRs de release simultâneos no extremo (todos os serviços com
  mudanças). Mitigação: mergeáveis em qualquer ordem, sem dependência;
  auto-merge habilitado quando o CI passa.
- "Que versão da plataforma está em prod?" não tem resposta única — só
  tem versões dos serviços. Aceitável: é o ponto de microsserviços. Em
  fase futura, dashboard agregador consultando `/version` de cada um.
- Commits que tocam múltiplos serviços precisam ser quebrados em commits
  separados por scope, ou release-please subestima a mudança. Disciplina
  exigida; não há fail-safe automático.
- Escopo de commit `repo`/`deps`/`ci`/`docs` não dispara release: mudanças
  estruturais ficam fora da timeline de release dos serviços. Aceitável:
  são mudanças operacionais, não release de produto.
- Promoção a `1.0.0` por serviço fica em aberto — critério (estabilidade
  de API, quantidade de breaking changes) decidido caso a caso quando
  aproximar do marco. ADR separada quando o primeiro `1.0.0` chegar.

**Neutras / a observar:**

- release-please em modo monorepo é maduro mas tem peculiaridades de
  config (path filters, manifest format, "include-component-in-tag").
  Documentar gotchas em runbook quando aparecerem.
- Volume de PRs de release pode parecer ruído visual — filtrar por label
  `autorelease: pending` ajuda.

## Alternativas consideradas

- **Versão sincronizada (todos os serviços compartilham X.Y.Z)** —
  descartada. Apaga a granularidade real, força bumps cosméticos, gera
  release-train cerimonial. Contrário à premissa de microsserviços.
- **Release manual com `git tag` + `gh release create`** — descartada.
  Funciona em projeto único; em monorepo com 12 packages vira trabalho
  repetitivo sujeito a erro humano (esquecer de bumpar manifest, mensagem
  de release inconsistente).
- **changesets (npm monorepo tooling)** — descartada. Excelente para
  ecossistema npm puro, mas exige arquivos `.changeset` manuais por
  contributor; release-please consome Conventional Commits diretamente,
  o que é mais barato no fluxo solo+LLM.
- **semantic-release** — descartada para a Fase 0. Capaz mas com
  ergonomia menos integrada ao monorepo do GitHub Actions; release-please
  do Google é mais "GitHub-nativo" (PR de release, integração com Releases).
  Reavaliar se release-please não acompanhar evolução.
- **Calendar-based release ("release train" mensal)** — descartada. Atrasa
  features prontas pelo calendário e contraria CI real do trunk-based.

## Referências

- `PROJECT_BRIEF.md` §5.1 (Estratégia de versionamento + release-please)
- ADR-0001 (Monorepo único poliglota)
- ADR-0002 (Conventional Commits com scope obrigatório — alimenta o roteamento)
- ADR-0003 (Trunk-based com squash merge — alimenta o histórico linear consumido)
- `docs/backlog/phase-0.md` P0-F6
- [release-please-action](https://github.com/googleapis/release-please-action)
- [Semantic Versioning 2.0.0](https://semver.org/)
