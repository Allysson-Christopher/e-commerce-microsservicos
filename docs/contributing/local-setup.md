# Local setup

> Como deixar a máquina pronta para contribuir com este monorepo.
> Deve levar **menos de 5 min** após a primeira vez.

## Requisitos

| Ferramenta         | Versão mínima | Verificar                                                       |
| ------------------ | ------------- | --------------------------------------------------------------- |
| **Node.js**        | 24.15.0 LTS   | `node --version`                                                |
| **npm**            | 11.0.0        | `npm --version`                                                 |
| **Go**             | 1.26          | `go version` (opcional até existir o `api-gateway`)             |
| **Java (Temurin)** | 25 LTS        | `java --version` (opcional até existir o primeiro serviço Java) |
| **Git**            | 2.40+         | `git --version`                                                 |
| **curl, tar**      | qualquer      | já vem no sistema                                               |

Recomendado: gerenciador de versões (`nvm` para Node, `mise`/`asdf` para os outros) para evitar conflito com versões do sistema.

## Passo a passo (primeira vez)

### 1. Instalar dependências do monorepo

```bash
npm install
```

Isso:

- baixa as devDependencies da raiz (`husky`, `commitlint`, `prettier`, `lint-staged`)
- ativa o `husky` via `prepare` script (instala os hooks em `.husky/`)

### 2. Instalar ferramentas binárias

Algumas ferramentas não vêm pelo `npm` — instalá-las via:

```bash
./tools/install-dev-tools.sh
```

Pinada hoje:

- **gitleaks 8.30.1** — scanner de secrets, usado pelo hook `pre-commit` e pelo CI

O script é idempotente (re-rodar é seguro) e instala em `~/.local/bin/`. Confirme que esse diretório está no seu `PATH`; se não, adicione ao seu shell profile:

```bash
export PATH="${HOME}/.local/bin:${PATH}"
```

### 3. Verificar a instalação

```bash
node --version          # >= 24.15.0
npm --version           # >= 11
gitleaks version        # 8.30.1
git config core.hooksPath  # .husky (deve aparecer assim)
```

### 4. Sanity check do hook

Faça um commit qualquer (ou simule) e veja Prettier formatando + gitleaks rodando:

```bash
echo "test" > /tmp/scratch.md
git add /tmp/scratch.md           # exemplo só ilustrativo
git commit -m "test(repo): smoke" # vai rejeitar (test exige scope conhecido + body? não — test não exige body)
```

## O que cada peça faz

```
┌─────────────────────────────────────────────────────────────┐
│ git commit                                                  │
│   │                                                         │
│   ├─ pre-commit hook (.husky/pre-commit)                    │
│   │     ├─ lint-staged        → Prettier nos arquivos staged│
│   │     └─ gitleaks protect   → bloqueia secrets staged     │
│   │                                                         │
│   └─ commit-msg hook (.husky/commit-msg)                    │
│         └─ commitlint         → valida Conventional Commits │
│                                                             │
│ git push (em main)                                          │
│   │                                                         │
│   └─ GitHub branch protection (server-side)                 │
│         └─ recusa o push e exige PR (ADR-0006)              │
└─────────────────────────────────────────────────────────────┘
```

### Proteção da branch `main`

Push direto em `main` é recusado pelo **GitHub** (server-side branch protection
ativa desde o cutover documentado em ADR-0006). Não há mais hook local — o
servidor faz o trabalho com mais robustez (vale também em pushes feitos de
outra máquina, runners de CI, ou chamadas API). ADR-0005 (que adicionou um
hook client-side enquanto o repo era privado em GitHub Free) está
**superseded**.

**Fluxo correto** (substitui `git push origin main` direto):

```bash
git switch -c feat/<scope>-<slug>
# trabalha, commita
git push -u origin feat/<scope>-<slug>
gh pr create --fill
# revisa o próprio diff
gh pr merge --squash
git switch main && git pull --ff-only
```

> **Não use `--delete-branch`** no `gh pr merge`. O repo está configurado com
> `delete_branch_on_merge=true`, então o GitHub deleta a branch remota
> automaticamente no merge; a flag tenta deletar de novo e falha com 404
> (cosmético, mas faz `gh` sair com exit code 1). A branch local é apagada
> pelo próprio `gh pr merge` ao voltar pra `main`. Se algum dia o repo perder
> o `delete_branch_on_merge=true`, daí sim re-incluir a flag.

## Quando algo dá errado

### `prepare` script não rodou e o hook não dispara

```bash
npx husky
git config core.hooksPath  # deve mostrar .husky
```

### Prettier reformatou demais

Adicione o caminho/glob a `.prettierignore` e re-stage o arquivo. Se for um arquivo gerado, considere também `.gitattributes` `linguist-generated=true` para colapsar o diff em PR.

### gitleaks falsificou um positivo

Não use `--no-verify`. Em vez disso:

1. Confirme que **não é** um secret de fato.
2. Adicione a regex no bloco `[allowlist] regexes` de `.gitleaks.toml` ou o caminho em `paths`.
3. Re-stage e commita; documente no body do commit por que o falso positivo passou a ser allowlisted (`Refs: docs/...`).

### `commitlint` rejeitou a mensagem

Veja [`docs/contributing/commits.md`](commits.md). Se for scope novo (serviço novo legítimo), adicione em `commitlint.config.js` no mesmo PR.

### Ferramenta binária com versão errada

```bash
rm ~/.local/bin/gitleaks
./tools/install-dev-tools.sh
```

## Atualizando versões

- **Node/npm:** `nvm install <new>` e atualizar `engines` no `package.json` raiz.
- **Ferramentas binárias:** atualizar a constante no topo de `tools/install-dev-tools.sh` e re-rodar o script.

Sempre cite a fonte oficial no commit body (release notes, changelog).
