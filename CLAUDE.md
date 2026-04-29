# CLAUDE.md

Instructions for Claude Code sessions in this repo. Read this file first.

## Project at a glance

E-commerce microsserviços B2C de moda — monorepo poliglota (Java/Spring, Node/TS/NestJS, Go) hospedado em VPS Hostinger única (staging + prod isolados). **Solo dev** trabalhando lado a lado com Claude Code; o git log é uma das principais fontes de contexto entre sessões.

- **Brief completo:** [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md)
- **Backlog atual:** [`docs/backlog/phase-0.md`](docs/backlog/phase-0.md) (Fase 0 — Bootstrap)
- **Convenções de commit:** [`docs/contributing/commits.md`](docs/contributing/commits.md)
- **Runtime versions:** Node 24 LTS, npm 11, Go 1.26, Java 25 LTS (overrides do brief v1.0)

## Filosofia de trabalho

- Avançamos **uma tarefa do backlog por vez**, com confirmação do usuário entre passos.
- Cada tarefa do backlog tem um **DoD** explícito; só marcar concluído quando o DoD for satisfeito.
- Decisões não-óbvias viram **ADR** em `docs/adr/` — ver [seção dedicada](#adrs--leia-antes-de-decidir-algo-arquitetural) abaixo.
- **Não inventar trabalho fora do escopo da tarefa atual.**

---

## Commit messages — leia antes de commitar

**Premissa:** o `git log` é o memorando institucional. Cada commit é contexto que sessões futuras (você + eu) vão consumir. Mensagem ruim hoje = decisão arqueológica amanhã.

### Estrutura obrigatória

```
<type>(<scope>): <subject>

<WHY: 1-3 frases — qual problema, qual restrição, qual decisão>

[opcional] <NON-OBVIOUS / GOTCHAS — invariante, ordem, edge case>
[opcional] <REJECTED ALTERNATIVES — o que foi descartado e por quê>
[opcional] <VERIFIED — comando ou observação que confirmou que funciona>

[opcional] Refs: ADR-XXXX, PROJECT_BRIEF.md §X, docs/runbooks/Y.md
[opcional] Closes: #N
[opcional] BREAKING CHANGE: <descrição>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### Regras de redação

1. **Subject ≤ 72 chars**, imperativo (`add`, `fix`, `migrate`, não `added` / `fixing`).
2. **Body obrigatório** para `feat`, `fix`, `refactor`, `perf` e qualquer commit com `!` (breaking). Opcional para `chore`, `docs`, `style`, `ci`, `build`, `test`.
3. **Body explica WHY**, não o WHAT. O diff já mostra o WHAT — não reescreva o diff em prosa.
4. **Cite âncoras concretas:** ADR-XXXX, `PROJECT_BRIEF.md §X`, caminho de arquivo, número de linha quando relevante.
5. **Mencione o que foi descartado** quando uma alternativa óbvia não foi escolhida — isso evita re-debate em sessões futuras.
6. **Mencione gotchas** que não estão no diff: ordem de operações que importa, invariante implícito, dependência sutil entre arquivos.
7. **`Verified:` quando aplicável** — um comando ou observação curta que comprova que a mudança funciona (`Verified: curl -s :8080/health → 200`).
8. **Linhas do body com no máximo 100 chars.**
9. **Sem emojis.** Sem `🤖 Generated with...` ou rodapés promocionais.
10. **Co-Authored-By** ao final, com o modelo atual.

### Exemplos

**Bom (feat com body informativo):**

```
feat(hello-service): expose /version endpoint with build metadata

Production diagnostics need to know which build is running without
SSHing into the VPS. /version returns service name, semver, commit
SHA and build timestamp injected at image build time.

Picked env vars over baking values into the JAR because the same
image is reused across environments — values come from the deploy.
Refs: PROJECT_BRIEF.md §5.1, docs/backlog/phase-0.md P0-E2
Verified: docker run … && curl :8080/version
```

**Ruim (não diz nada que o diff não diga):**

```
feat(hello-service): add version endpoint
```

### Quando o usuário pedir "commita isso"

1. Releia o diff (`git diff --staged`).
2. Identifique **WHY** a partir da conversa atual.
3. Identifique **alternativas discutidas e rejeitadas** na conversa.
4. Identifique **referências**: brief, backlog, ADRs, runbooks, issues.
5. Escreva subject conciso e body que **não** redescreva o diff.
6. Use heredoc para preservar a formatação (ver Bash tool guidance).
7. **Não bypass `--no-verify`** — se o hook reclamar, ajuste a mensagem.

### Quando _não_ escrever body

Para `chore`/`docs`/`style`/`ci`/`build`/`test` triviais, o subject sozinho basta:

```
chore(deps): bump axios from 1.7.0 to 1.7.4
docs(repo): fix typo in README
style(hello-service): apply prettier to controllers
```

Se o `chore`/`docs` envolver decisão (ex.: `chore(repo): switch from npm to pnpm`), aí o body volta a ser obrigatório por princípio, mesmo que o linter não exija.

---

## ADRs — leia antes de decidir algo arquitetural

**Premissa:** ADRs (Architecture Decision Records) registram **o porquê** de uma decisão de design — o `PROJECT_BRIEF.md` consolidou as escolhas iniciais; ADRs são as unidades atômicas e linkáveis dessas escolhas (e das que vierem depois). Mensagens de commit citam ADR-XXXX; o brief, runbooks e PRs futuros também. Sem o registro, a decisão vira folclore.

### Padrão obrigatório: ADR nasce junto com a implementação

A regra default deste repo é **uma ADR por PR de tarefa que toma uma decisão arquitetural**, criada **no mesmo PR** que implementa a decisão.

- ADR escrita junto com o código fica **concreta** — cita arquivos, comandos, números reais, alternativas que foram realmente testadas e descartadas.
- ADR escrita em lote no início do projeto vira **paráfrase do brief** — perde valor de pesquisa e de contexto.
- O PR que cita `Refs: ADR-XXXX` deve **conter o arquivo da ADR** no diff (a ADR não pode estar pendente em outro PR).

**Exceção controlada:** ADRs **meta** (formato, processo) e ADRs **estruturais já decididas no brief e em uso desde o primeiro commit** (monorepo poliglota, Conventional Commits, trunk-based, release-please) podem ser escritas antecipadamente em lote, **uma única vez no início da Fase 0**, porque o código que as implementa já existe — a ADR está apenas registrando o que já foi feito.

A lista exata dessas ADRs antecipadas vive em `docs/adr/README.md`. Toda ADR adicional segue o padrão default (nasce no PR da tarefa).

### Quando criar uma ADR

Crie quando a decisão tiver **pelo menos uma** destas características:

- Afeta mais de um serviço ou mais de uma fase do projeto.
- Tem alternativa viável que foi descartada (e o motivo do descarte importa).
- Restrição externa (LGPD, PCI, custo da VPS, RAM disponível) influenciou a escolha.
- Você suspeita que vai precisar revisitar a decisão em 3+ meses.
- Mudança em runtime, framework, broker, banco, ou padrão de integração.

**Não crie ADR para:**

- Bug fix simples, refactor sem mudança de comportamento, bump de dep patch.
- Decisão local de um único arquivo (ex.: nome de variável).
- Reaplicação direta de uma decisão já registrada em ADR existente (cite a existente).

Em dúvida: **pergunte antes de codar**, não depois.

### Estrutura (Michael Nygard)

Toda ADR usa o mesmo template em `docs/adr/template.md`. Seções obrigatórias:

```
# ADR-XXXX — <título conciso, imperativo>

- **Status:** proposed | accepted | deprecated | superseded by ADR-YYYY
- **Data:** YYYY-MM-DD
- **Decisores:** Allysson Christopher
- **Tags:** <ex.: infra, security, frontend, ci-cd>

## Contexto
<o problema, restrições, forças em jogo. Não pressupor que o leitor leu o brief.>

## Decisão
<o que foi decidido, em uma frase no início; depois detalhar.>

## Consequências
<positivas, negativas, neutras. O que muda no dia a dia, no que precisamos aprender.>

## Alternativas consideradas
<opções avaliadas e por que foram descartadas. 1-3 frases por alternativa.>

## Referências
<brief §X, outras ADRs, links externos, RFC, runbooks.>
```

### Convenções

- **Numeração:** sequencial, 4 dígitos zero-padded (`ADR-0001`, `ADR-0002`, ...). Nunca reaproveitar número de ADR descartada.
- **Nome do arquivo:** `docs/adr/ADR-XXXX-kebab-case-titulo.md`.
- **Status inicial:** quase sempre `accepted` (este projeto é solo — não há ciclo de revisão coletiva). `proposed` só se a ADR estiver explicitamente em rascunho aguardando decisão futura.
- **Imutabilidade:** ADR `accepted` **não é editada** retroativamente. Mudou de ideia? Crie nova ADR com `Supersedes: ADR-XXXX`; marque a antiga como `superseded by ADR-YYYY`.
- **Índice:** `docs/adr/README.md` lista todas as ADRs com status, data e link. Atualizar a cada nova ADR.
- **Linguagem:** PT-BR (consistente com brief e backlog).

### Como referenciar em commits

Use o footer `Refs:` da mensagem de commit (já obrigatório pela seção de Commit messages):

```
Refs: ADR-0007, PROJECT_BRIEF.md §7.2
```

ADRs podem se referenciar entre si na seção `## Referências` do próprio documento.

---

## Outras convenções

- **Conventional Commits + scope obrigatório** — ver [`docs/contributing/commits.md`](docs/contributing/commits.md) para a lista completa de scopes permitidos.
- **Trunk-based development** — branches curtas, squash merge em `main`, sem `develop`.
- **TaskCreate/TaskUpdate** — use para tracking quando uma tarefa do backlog tiver múltiplos sub-passos não triviais.
- **Memory** — atualize `~/.claude/projects/.../memory/` quando aprender algo durável sobre o projeto ou o usuário.

## Quando estiver em dúvida

Pergunte ao usuário antes de:

- Adicionar dependências novas (sempre justificar);
- Tomar decisões arquiteturais que afetem múltiplos serviços;
- Mudar runtime/versões pinadas;
- Pular passos do backlog ou consolidar tarefas.
