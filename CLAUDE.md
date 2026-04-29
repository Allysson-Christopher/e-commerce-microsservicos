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
- Decisões não-óbvias viram **ADR** em `docs/adr/`.
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

### Quando *não* escrever body

Para `chore`/`docs`/`style`/`ci`/`build`/`test` triviais, o subject sozinho basta:
```
chore(deps): bump axios from 1.7.0 to 1.7.4
docs(repo): fix typo in README
style(hello-service): apply prettier to controllers
```

Se o `chore`/`docs` envolver decisão (ex.: `chore(repo): switch from npm to pnpm`), aí o body volta a ser obrigatório por princípio, mesmo que o linter não exija.

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
