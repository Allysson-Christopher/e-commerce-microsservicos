# ADR-0001 — Adotar monorepo único poliglota

- **Status:** accepted
- **Data:** 2026-04-29
- **Decisores:** Allysson Christopher
- **Tags:** repo, estrutura, ci-cd, contracts

## Contexto

O projeto comporta ~10-12 microsserviços em três linguagens (Java/Spring,
Node/TS/NestJS, Go), contratos compartilhados (OpenAPI + Protobuf), dois
frontends Next.js, infra como código (Ansible + OpenTofu + Compose + futuro
k8s/Helm) e documentação extensa (`PROJECT_BRIEF.md`, ADRs, runbooks,
backlog, compliance).

Restrições e forças relevantes:

- **Dev solo + Claude Code:** ferramentas de IA codam melhor com a base
  inteira visível em uma única árvore — refactor cross-service em 1 PR,
  contratos consumidos por múltiplos serviços visíveis no mesmo grep.
- Sem times com fronteiras políticas distintas — o argumento clássico
  pró-multi-repo (autonomia organizacional) não se aplica.
- VPS Hostinger única hospeda staging+prod; deploy é por imagem Docker, não
  por checkout do repo no servidor — tamanho do clone na máquina dev não é
  problema.
- Contratos (`.proto` + OpenAPI) precisam ser consumidos por código nas três
  linguagens; manter isso em sincronia entre repos separados é dor real.

Esta decisão define a estratégia de organização do código — afeta CI/CD,
contratos, deploy, geração de código e workflow de desenvolvimento.

## Decisão

**Adotamos um monorepo único poliglota com `infra/` interno**, com a estrutura
descrita em `PROJECT_BRIEF.md` §4.1:

```
ecommerce/
├── services/         (Java + Node + Go, builds nativos por linguagem)
├── contracts/        (proto/ + openapi/, fonte da verdade dos contratos)
├── frontend/         (web/ + admin/ Next.js + shared/)
├── infra/            (ansible/ + terraform/ + docker/ + k8s/)
├── libs/             (libs internas — só se justificar)
├── tools/            (scripts dev, gen, seed)
├── docs/             (brief, ADRs, runbooks, backlog, compliance)
├── go.work           (workspace Go)
├── package.json      (npm workspaces para Node)
└── Makefile          (orquestração local)
```

Princípios derivados:

- **Builds nativos por linguagem:** Java com Maven standalone por serviço
  (sem multi-module pai), Node com `npm workspaces`, Go com `go.work`.
- **Sem Nx/Turborepo/Bazel no início** — apenas scripts shell + Makefile.
  Reavaliar quando o build sem cache passar de ~10 min.
- **Path filters no GitHub Actions** para rodar CI só no que mudou.
- **Sem `infra/` em repo separado** na Fase 0/1. Migrar para repo dedicado
  só quando entrarmos em GitOps com ArgoCD (Fase 2+) e a separação trouxer
  valor real.
- **Sem `contracts/` em repo separado** enquanto o consumidor for apenas
  código deste mesmo repo. Extrair quando terceiros precisarem consumir.

Critérios documentados para "promover" partes a repos separados (§4.1 do brief):

- Expor `contracts/` para terceiros consumirem.
- Infra crescer ao ponto de exigir repo dedicado (e exercitar GitOps com
  manifests em repo separado).
- Build do monorepo passar de ~10 min sem cache.
- Open source de parte do projeto.

## Consequências

**Positivas:**

- Refactor cross-service em 1 PR (renomear evento Kafka que afeta producer
  - 3 consumers fica atômico).
- Contratos e seus consumidores no mesmo lugar — `buf breaking` no CI vê
  tudo de uma vez.
- Claude Code enxerga toda a base — análises e mudanças coordenadas ficam
  triviais.
- Versionamento único do `PROJECT_BRIEF.md` e ADRs com o código que os
  implementa.
- Tooling de monorepo poliglota fica como exercício didático real (path
  filters, npm workspaces, go.work, builds nativos por linguagem).

**Negativas / trade-offs aceitos:**

- CI sem cache pode crescer rápido — mitigado por path filters e cache de
  deps por linguagem.
- Permissões de acesso são all-or-nothing — não dá para dar acesso só ao
  `payment-service`. Aceitável: solo dev, repo privado.
- Históricos de release ficam misturados no `git log` — mitigado pelo scope
  obrigatório nos commits e por release-please abrir 1 PR de release por
  serviço (ADR-0004).
- Nenhuma prática genuína de "contrato entre repos" exercitada na Fase 0
  — exercício adiado para quando justificar (critério de promoção acima).

**Neutras / a observar:**

- Quando o repo crescer, `git clone` pode pesar. Acompanhar via `git count-objects -vH`.
- Decisão de adicionar Nx/Turborepo entra como ADR separada quando a dor
  aparecer.

## Alternativas consideradas

- **Multi-repo (1 repo por serviço)** — descartada. Maximiza autonomia, mas
  o projeto é solo: não há autonomia política a preservar. Custo de manter
  contratos sincronizados entre repos separados é alto, e Claude Code perde
  contexto cross-service em sessões.
- **Monorepo com Nx/Turborepo desde o início** — descartada para a Fase 0.
  Adiciona uma camada de abstração (task graph, cache distribuído) que
  resolve um problema que ainda não temos. Reavaliar quando o build crescer.
- **Monorepo + repos auxiliares (`contracts/` separado, `infra/` separado)
  desde o início** — descartada para a Fase 0. Promove ANTES da dor justificar
  — ver critérios de promoção na seção Decisão.
- **Monorepo Bazel** — descartada. Custo de aprendizado alto para benefício
  marginal em projeto solo de escala média.

## Referências

- `PROJECT_BRIEF.md` §4.1 (Estrutura do Repositório)
- ADR-0002 (Conventional Commits com scope obrigatório — viabiliza
  rastreabilidade por serviço dentro do monorepo)
- ADR-0004 (Versionamento independente por serviço — viabiliza releases
  separadas dentro do monorepo)
- `docs/backlog/phase-0.md` P0-A1, P0-A3
