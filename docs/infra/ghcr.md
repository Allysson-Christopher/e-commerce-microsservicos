# GitHub Container Registry (GHCR) — estado atual

> **Para que serve este documento:** registro **declarativo** da política e dos
> packages do projeto no GHCR. Análogo a `docs/infra/cloudflare.md`, escala
> menor (GHCR não tem "zona", "NS", "SSL mode" — a superfície configurável é
> visibilidade por package + retenção + auth).
>
> **Estado em IaC vs aqui:** GHCR não é gerenciável via OpenTofu hoje (provider
> oficial do GitHub não cobre packages). Este arquivo permanece como fonte da
> verdade da política até existir alternativa. Mudanças concretas (push de
> imagem, toggle de visibilidade) ficam registradas em commits e em workflows
> `.github/workflows/cd-*.yml`.
>
> **Última atualização:** 2026-05-02 (encerramento de P0-B3).

---

## Identidade

| Campo               | Valor                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| **Namespace**       | `ghcr.io/allysson-christopher/`                                                  |
| **Owner**           | `Allysson-Christopher` (user, não org) — id `128186654`                          |
| **Plano**           | GitHub Free (packages públicos = storage e bandwidth ilimitados)                 |
| **Auth de leitura** | Pública (sem auth) para packages com `visibility=public`; tokens só pra privados |
| **Auth de escrita** | `GITHUB_TOKEN` no workflow do mesmo repo, com `permissions: packages: write`     |

Conta vinculada ao repo `Allysson-Christopher/e-commerce-microsservicos`. GHCR
nasce automaticamente para qualquer repo do GitHub — não há "habilitar" como
ação separada; o package é criado no primeiro `docker push` bem-sucedido.

---

## Política de visibilidade

| Configuração    | Valor                                |
| --------------- | ------------------------------------ |
| **Default**     | **Public**                           |
| **Decidido em** | 2026-05-02 (PR de P0-B3)             |
| **Aplicável a** | Todos os packages futuros do projeto |

**Razão da escolha (alinha com ADR-0006):** o repo é público desde o cutover
educacional; manter as imagens Docker privadas seria assimetria sem proteção
real (qualquer um pode `git clone` + `docker build` localmente e reproduzir).
Imagens públicas habilitam `docker pull` direto em qualquer ambiente sem
gerenciar tokens — útil pra portfolio, demo, CI externo.

**Trade-offs aceitos com mitigação explícita:**

| Risco                                             | Mitigação                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Build leak (labels, layers, env vars cacheados)   | `.dockerignore` agressivo + multi-stage build (P0-E3) + revisão de `LABEL`/`ENV`    |
| Vulnerabilidade conhecida em dep exposta ao mundo | Trivy scan obrigatório no pipeline (P0-F2 e P0-H3); HIGH/CRITICAL bloqueia push     |
| Metadata leak (commit SHA, branch name em tags)   | Aceito — imagens já citam SHA pra rastreabilidade (`/version` endpoint, brief §5.1) |
| Pull livre de imagens vulneráveis após deploy     | Tags imutáveis por release (semver via release-please); `latest` só pra dev local   |

**Como mudar visibilidade de um package específico** (procedimento manual, ad-hoc):

```bash
# Após o primeiro push de uma imagem nova:
gh api -X PATCH \
  "/users/Allysson-Christopher/packages/container/<package-name>" \
  -f visibility=public
```

Ou via UI: `https://github.com/Allysson-Christopher?tab=packages` → click no package → Package settings → Change visibility.

---

## Auth para escrita (publishing)

**Mecanismo único:** `GITHUB_TOKEN` injetado automaticamente em workflows
do `Allysson-Christopher/e-commerce-microsservicos`. Cada workflow que
publica imagem precisa declarar `permissions: packages: write` no top-level
ou no job correspondente.

Exemplo canônico (vai aparecer em P0-F2):

```yaml
permissions:
  contents: read
  packages: write # exigido pra docker push em ghcr.io/<owner>/<repo>

jobs:
  build-and-push:
    steps:
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - run: docker push ghcr.io/${{ github.repository_owner }}/<service>:<tag>
```

**PATs (Personal Access Tokens) — não usados:**

Avaliada a hipótese de criar PAT classic com `write:packages` para teste
manual local de `docker push` em P0-B3. **Descartada** com justificativa:

- `GITHUB_TOKEN` cobre 100% do caso de uso real (workflow CD do Grupo F);
- Pacotes são públicos — `docker pull` não requer auth; PAT seria só pra push;
- Criar PAT long-lived na máquina dev viola brief §0.1 ("princípio do menor
  privilégio", "tokens humanos curtos"); equivale ao trade-off rejeitado em
  ADR-0009 (chave SSH long-lived);
- Se cenário futuro exigir push manual (CI externo, máquina de CD alternativa),
  criar PAT fine-grained com escopo mínimo + expiração curta sob demanda — não
  pré-criar especulativamente.

---

## Política de retenção

**TBD em P0-F2.** Placeholder atual:

- Manter **todas as versões com tag semver** (`v0.1.0`, `v0.1.1`, ...) — produzidas pelo release-please (ADR-0004).
- Manter **últimas N untagged** (N a definir; default sugerido: 10) para builds de PR / `main`.
- Limpar `latest` antigo automaticamente (sempre sobrescrito).

Ferramenta provável: GitHub Action `actions/delete-package-versions@v5` rodando
no schedule semanal, ou retenção configurada no `Package settings → Manage
Actions access` quando GitHub expor a opção pelo CLI.

---

## Packages atuais

**Lista vazia.** Primeiro package nasce em **P0-F2** (push da imagem do
hello-service). Quando criado, populamos esta seção:

| Package                   | Visibilidade | Primeiro push | Tags vivas | Comentário |
| ------------------------- | ------------ | ------------- | ---------- | ---------- |
| _(nenhum até 2026-05-02)_ | —            | —             | —          | —          |

---

## Princípios em uso

- **Least privilege** — escrita só via `GITHUB_TOKEN` escoped por workflow
  (vida = duração do job, ~minutos). Sem PATs long-lived na máquina dev.
- **Público por consistência** — repo público + imagem pública é coerente;
  imagem privada com repo público seria security theater.
- **Defense in depth** — Trivy obrigatório no CI (P0-F2 / P0-H3) compensa
  exposição pública: vulnerabilidades não saem em release.
- **Rastreabilidade** — toda imagem traz commit SHA via `LABEL` + endpoint
  `/version` (brief §5.1); tags semver imutáveis por release-please.
- **Tagging policy** — `ghcr.io/<owner>/<service>:<semver>` (ex.: `:1.3.0`)
  - `ghcr.io/<owner>/<service>:latest` apenas pra conveniência local;
    **prod nunca puxa `latest`** (brief §5.1).

---

## Não configurado / fora do escopo

| Item                                           | Tarefa que vai cobrir                           |
| ---------------------------------------------- | ----------------------------------------------- |
| Primeiro push de imagem (hello-service)        | P0-F2                                           |
| Trivy scan no pipeline com block HIGH/CRITICAL | P0-F2 + P0-H3                                   |
| Retenção automatizada (cleanup de untagged)    | P0-F2 ou tarefa específica de Grupo H           |
| Cosign image signing + SBOM (sigstore)         | Adiado — brief §5.3 marcou como opcional Fase 1 |
| Mirror para outro registry (ECR, Docker Hub)   | Não previsto — único registry                   |

---

## Revogações / mudanças passadas

Vazio. Quando algo mudar (package privatizado retroativamente, namespace
migrado pra org, retention policy alterada, etc.), append aqui com data e razão.

---

## Referências cruzadas

- `docs/backlog/phase-0.md` P0-B3 — DoD original e notas de execução
- `PROJECT_BRIEF.md` §5.1 — versionamento independente, GHCR como registry
  escolhido, formato de tags
- `PROJECT_BRIEF.md` §5.3 — CI/CD, GHCR, secrets via Environments
- ADR-0006 — repo público (motiva escolha de packages públicos)
- ADR-0004 — versionamento independente com release-please (gera as tags
  semver que entram em GHCR)
- [GitHub Docs — Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Docs — Configuring a package's access control and visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
