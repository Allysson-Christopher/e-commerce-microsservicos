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
└─────────────────────────────────────────────────────────────┘
```

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
