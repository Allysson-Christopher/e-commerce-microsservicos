# ADR-0000 — Como usamos ADRs neste projeto

- **Status:** accepted
- **Data:** 2026-04-29
- **Decisores:** Allysson Christopher
- **Tags:** meta, processo, documentação

## Contexto

Este projeto é um e-commerce de microsserviços construído por **um dev solo**
trabalhando lado a lado com Claude Code, em sessões com horizonte temporal
longo (estimativa total 6-9 meses, dividida em 6 fases). O `git log` é o
memorando institucional entre sessões e o `PROJECT_BRIEF.md` consolidou ~30
decisões iniciais em um único documento monolítico de ~1770 linhas.

Sem registro atômico das decisões, dois problemas reais aparecem rápido:

1. **Decisões viram folclore** — daqui a 3 meses não vai estar claro por que
   Pagar.me venceu MercadoPago, ou por que Vault venceu Doppler. O brief diz,
   mas é difícil de encontrar e fácil de re-debater.
2. **Commits perdem âncora** — a política de commit messages (ver `CLAUDE.md`)
   exige `Refs: ADR-XXXX` para decisões não-óbvias. Sem ADRs catalogadas, a
   referência aponta para o vazio.

Precisamos de um padrão: como ADRs são escritas, numeradas, mantidas e
referenciadas neste repo.

## Decisão

**Adotamos ADRs no formato Michael Nygard, com numeração sequencial de 4 dígitos, e a regra default de que toda ADR nasce no PR da tarefa que toma a decisão correspondente.**

Detalhamento:

- **Localização:** `docs/adr/`. Cada ADR em arquivo próprio:
  `docs/adr/ADR-XXXX-kebab-case-titulo.md`.
- **Template:** `docs/adr/template.md` (Michael Nygard) com seções obrigatórias
  Contexto, Decisão, Consequências, Alternativas consideradas, Referências.
- **Numeração:** sequencial, 4 dígitos zero-padded (`ADR-0000`, `ADR-0001`, ...).
  Nunca reaproveitar número de ADR descartada.
- **Status:** `proposed` (em rascunho, decisão pendente), `accepted` (default
  deste repo), `deprecated` (não mais aplicável; sem substituta direta),
  `superseded by ADR-YYYY` (substituída por nova ADR).
- **Imutabilidade:** ADR `accepted` não é editada retroativamente. Mudou de
  ideia? Cria nova ADR com `Supersedes: ADR-XXXX` e marca a antiga como
  `superseded by ADR-YYYY`. Correções triviais (typo, link quebrado) são
  permitidas e ficam registradas no commit.
- **Linguagem:** PT-BR, consistente com `PROJECT_BRIEF.md` e backlog.
- **Índice:** `docs/adr/README.md` é o índice vivo — atualizar a cada nova ADR.
- **Referência em commits:** footer `Refs: ADR-XXXX` na mensagem de commit
  (já obrigatório para `feat`/`fix`/`refactor`/`perf`/`!`).

**Padrão default — ADR junto com a implementação:**

A regra é **uma ADR por PR de tarefa que toma uma decisão arquitetural**,
criada no mesmo PR que implementa a decisão. O arquivo da ADR aparece no
diff junto com o código. Motivo: ADR escrita junto com o código fica
concreta — cita arquivos reais, comandos efetivamente executados,
alternativas que foram realmente testadas. ADR escrita em lote no início
do projeto vira paráfrase do brief e perde valor de pesquisa.

**Exceção controlada — lote inicial:**

ADRs **meta** (esta, ADR-0000) e ADRs **estruturais já decididas no brief
e em uso desde o primeiro commit** podem ser escritas antecipadamente, em
lote, **uma única vez no início da Fase 0**, porque o código que as
implementa já existe e a ADR está apenas registrando o que já foi feito
sem rasura.

Lote inicial autorizado (Fase 0, P0-I3):

- `ADR-0000` — Como usamos ADRs neste projeto (esta)
- `ADR-0001` — Adotar monorepo único poliglota
- `ADR-0002` — Conventional Commits com scope obrigatório + body-required-when-typed
- `ADR-0003` — Trunk-based development com squash merge
- `ADR-0004` — Versionamento independente por serviço com release-please

Toda ADR adicional segue o padrão default. A lista de ADRs candidatas e em
qual tarefa cada uma deve nascer fica em `docs/adr/README.md`.

**Quando criar uma ADR:**

Pelo menos uma destas características deve estar presente:

- Afeta mais de um serviço ou mais de uma fase do projeto.
- Tem alternativa viável que foi descartada (e o motivo importa).
- Restrição externa (LGPD, PCI, custo da VPS, RAM disponível) influenciou
  a escolha.
- Suspeita de revisita em 3+ meses.
- Mudança em runtime, framework, broker, banco, ou padrão de integração.

**Quando NÃO criar:**

- Bug fix simples, refactor sem mudança de comportamento, bump de dep patch.
- Decisão local de um único arquivo (ex.: nome de variável).
- Reaplicação direta de uma decisão já registrada — cite a ADR existente.

## Consequências

**Positivas:**

- Cada decisão ganha um endereço único e citável (`ADR-XXXX`).
- Commits, runbooks e PRs futuros têm âncora estável.
- Sessões futuras (você + Claude Code) recuperam **o porquê** sem reler o
  brief inteiro.
- ADR escrita com a implementação é concreta e referencia código real.
- Imutabilidade força que mudanças de rumo sejam explícitas (nova ADR,
  histórico preservado).

**Negativas / trade-offs aceitos:**

- Custo cognitivo extra em PRs que tomam decisão (~15-30 min para
  escrever a ADR direito).
- Pequeno risco de ADR `proposed` esquecida em rascunho — mitigado pelo
  índice em `docs/adr/README.md` que destaca status.
- Decisões grandes do brief (~25-30 candidatas a ADR) só serão
  formalizadas conforme as tarefas correspondentes do backlog forem
  executadas. Até lá, o brief é a fonte canônica.

**Neutras / a observar:**

- Volume estimado: 25-30 ADRs ao longo do ciclo do projeto (todas as
  fases). Se ultrapassar, revisitar critério "Quando criar".
- Padrão Michael Nygard sem MADR/Y-statement extras — manter simples
  enquanto for solo dev. Se entrar mais alguém, reavaliar.

## Alternativas consideradas

- **MADR (Markdown Any Decision Records)** — formato mais elaborado com
  campos `Y-statement`, `Pros/Cons` por opção, `Decision Drivers`.
  Descartado para a Fase 0 por overhead em projeto solo. Reavaliar se
  outro dev entrar no projeto ou se decisões começarem a ter mais de 3
  alternativas relevantes em média.
- **Confluence / Notion / wiki externa** — descartado: separa decisão do
  código, exige autenticação, não versiona junto com o repo, e Claude Code
  não consegue ler facilmente em sessões futuras.
- **Apenas seções no `PROJECT_BRIEF.md`** — descartado: não tem endereço
  citável em commits (`Refs: §5.1` é ambíguo se a seção crescer), não
  registra mudanças de rumo (o brief é versionado mas não imutável por
  decisão), e o documento já tem ~1770 linhas — não escala.
- **ADRs criadas todas em lote no início do projeto** — descartado: vira
  paráfrase do brief, perde valor de pesquisa, e perde a chance de citar
  arquivos/comandos/números reais da implementação. A exceção controlada
  cobre apenas as 4-5 ADRs estruturais que já estão em código e cujo
  contexto não vai mudar.

## Referências

- `PROJECT_BRIEF.md` §11 (Próximos Passos — item 2: ADRs críticos)
- `CLAUDE.md` §"ADRs — leia antes de decidir algo arquitetural"
- `docs/backlog/phase-0.md` P0-I3
- `docs/adr/template.md`
- Michael Nygard, _Documenting Architecture Decisions_ (2011) — formato base
