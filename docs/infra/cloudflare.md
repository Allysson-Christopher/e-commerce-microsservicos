# Cloudflare — estado atual da zona

> **Para que serve este documento:** registro **declarativo** dos valores
> efetivamente em uso na zona Cloudflare do projeto. Complementa
> `docs/runbooks/cloudflare-setup.md` (que descreve _como reproduzir_).
>
> **Estado em IaC vs aqui:** até P0-D1, este arquivo é a fonte da verdade do
> que existe na zona. Após P0-D1, a fonte da verdade vira o state OpenTofu —
> este arquivo passa a ser **espelho legível por humano** (atualizado
> manualmente quando IaC mudar).
>
> **Última atualização:** 2026-05-02 (final da execução de P0-B2).

---

## Identidade

| Campo                  | Valor                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Domínio**            | `chatdelta.cloud`                                                            |
| **Registrar**          | Hostinger                                                                    |
| **Compra**             | 2026-05-02                                                                   |
| **Cloudflare Account** | conta de `allyssoncsf@gmail.com` (Free plan)                                 |
| **Cloudflare Zone ID** | `TBD` (visível em CF → `chatdelta.cloud` → Overview → sidebar direita "API") |
| **Plano da zona**      | Free                                                                         |

---

## Nameservers

```
marty.ns.cloudflare.com
destiny.ns.cloudflare.com
```

Atribuídos pelo CF na criação da zona (2026-05-02). Atualizados no painel
Hostinger no mesmo dia; propagação confirmada em ~minutos via:

```bash
dig +short NS chatdelta.cloud @1.1.1.1   # Cloudflare resolver
dig +short NS chatdelta.cloud @8.8.8.8   # Google resolver
```

SOA authoritative em `destiny.ns.cloudflare.com`.

---

## Origem

Toda a tráfego HTTP(S) que entra pelo CF tem como origem a EC2 do projeto:

| Campo                   | Valor                              |
| ----------------------- | ---------------------------------- |
| **Origem (Elastic IP)** | `32.193.69.140`                    |
| **EIP AllocationId**    | `eipalloc-03c82731695e04b80`       |
| **EIP AssociationId**   | `eipassoc-0e14542cccf1bb90c`       |
| **EC2 Instance**        | `i-072708190abd3d102` (us-east-1b) |
| **Tipo**                | `t3.micro` (AL2023)                |

Detalhes da EC2 e do EIP ficam em `docs/infra/aws-specs.md` (a criar — última
TODO do P0-B4).

---

## Registros DNS

Estado atual (5 registros):

| Type  | Name                              | Content           | Proxy      | TTL  | Comentário              |
| ----- | --------------------------------- | ----------------- | ---------- | ---- | ----------------------- |
| A     | `chatdelta.cloud`                 | `32.193.69.140`   | 🟠 Proxied | Auto | Apex — prod (futuro)    |
| A     | `staging.chatdelta.cloud`         | `32.193.69.140`   | 🟠 Proxied | Auto | EC2 EIP — staging       |
| A     | `traefik.staging.chatdelta.cloud` | `32.193.69.140`   | 🟠 Proxied | Auto | Traefik admin — staging |
| A     | `grafana.staging.chatdelta.cloud` | `32.193.69.140`   | 🟠 Proxied | Auto | Grafana admin — staging |
| CNAME | `www`                             | `chatdelta.cloud` | 🟠 Proxied | Auto | Padrão `www → apex`     |

**Verificação esperada via dig** (todos retornam IPs Cloudflare proxy, NUNCA
o EIP `32.193.69.140` — origem fica escondida; brief §7.2):

```bash
dig +short A chatdelta.cloud @1.1.1.1
# 104.21.36.175
# 172.67.197.232
```

(IPs Cloudflare específicos podem rodar entre datacenters; o que importa é
serem **do range CF** e **nunca** o EIP.)

---

## SSL/TLS

| Configuração            | Valor                                                 |
| ----------------------- | ----------------------------------------------------- |
| **Encryption mode**     | **Full (strict)**                                     |
| **Mudado em**           | 2026-05-02                                            |
| **Automatic mode**      | desabilitado em 2026-05-02 (controle manual)          |
| **Universal SSL cert**  | auto-emitido por CF, cobre apex + `*.chatdelta.cloud` |
| **Minimum TLS Version** | (default CF — 1.2)                                    |

**Implicação operacional:** até P0-D3 (Let's Encrypt no Traefik), a origem
não tem cert válido — qualquer hit ao domínio retorna **525/526** do CF.
Sem visibilidade externa (Phase 0 sem tráfego real); risco aceito.

---

## HSTS

| Configuração            | Valor             |
| ----------------------- | ----------------- |
| **Status**              | **On**            |
| **Habilitado em**       | 2026-05-02        |
| **`max-age`**           | 30 dias (2592000) |
| **`includeSubDomains`** | Off               |
| **`preload`**           | Off               |
| **No-Sniff Header**     | On                |

**Plano de ramp futuro** (não fazer agora; documentar pra revisita):

```
Mês 0 (atual): max-age=1mo, !subdomains, !preload
Mês 1+:        considerar max-age=6mo se tudo estável
Mês 3-6+:      max-age=1yr; ligar includeSubDomains se TUDO subdomínio HTTPS
Ano 1+:        max-age=2yr; submissão à hstspreload.org
```

**Recovery:** se HSTS configurado errado trancar visitantes, browser cache
respeita `max-age` — não dá pra desligar remotamente. Único caminho: reduzir
`max-age` e esperar; ou usuário limpar HSTS cache local
(`chrome://net-internals/#hsts`).

---

## Bot Fight Mode

| Configuração      | Valor      |
| ----------------- | ---------- |
| **Status**        | **On**     |
| **Habilitado em** | 2026-05-02 |

Heurística leve do CF — bloqueia/desafia bots óbvios (data centers, headless
browsers mal configurados); good bots (Googlebot, Bingbot) passam por
allowlist mantida pelo CF. Logs em **Security Events**.

---

## API Tokens

| Token name                     | Permissions                   | Zone Resources    | Storage         | Criado em  | Status |
| ------------------------------ | ----------------------------- | ----------------- | --------------- | ---------- | ------ |
| `opentofu-chatdelta-cloud-dns` | `Zone:Read` + `Zone:DNS:Edit` | `chatdelta.cloud` | Bitwarden vault | 2026-05-02 | Active |

**Princípios em uso:**

- **Least privilege** — DNS:Edit + Zone:Read é o mínimo pra OpenTofu (P0-D1)
  gerenciar registros DNS. Toggles de SSL/HSTS/Bot Fight foram feitos
  manualmente; quando mudarem pra IaC, criar **token separado** com
  `Zone Settings:Edit` em vez de expandir esse.
- **Zone-scoped** — restrito a `chatdelta.cloud` apenas, nunca "All zones".
- **Storage seguro** — só em password manager local; se for usar em GitHub
  Actions, replicar como `CLOUDFLARE_API_TOKEN_DNS` em **Repository Secret**
  (não Environment Secret a princípio — escopar quando OIDC entrar em P0-F).
- **Rotação** — sem TTL automático; rotacionar manualmente quando suspeitar
  comprometimento, deixar ex-funcionário, ou anualmente como higiene.

**Tokens NÃO criados** (registro do que **não** está sendo usado):

- Global API Key — caminho legado, jamais usar
- Account-scoped tokens — não necessários até precisar ler/escrever em
  recursos cross-zone

---

## Page Rules / WAF Custom Rules / Workers / etc.

**Nada configurado ainda.** P0-B2 cobriu apenas o baseline (DNS + SSL + HSTS +
Bot Fight + token). Configurações adicionais previstas:

| Recurso                                                           | Tarefa que vai configurar  |
| ----------------------------------------------------------------- | -------------------------- |
| Page Rules (cache catálogo público / no-cache rotas autenticadas) | P0-D1 (via OpenTofu)       |
| Authenticated Origin Pulls (mTLS CF → origem)                     | P0-D4                      |
| Cloudflare Turnstile em /auth/login etc                           | Fase 1 (após auth-service) |
| Cloudflare Logpush (pra B2/S3 long-term)                          | Fase 2+ (avançado)         |

---

## Revogações / mudanças passadas

Vazio por enquanto — primeira execução. Quando algo mudar (token revogado,
zona deletada/recriada, registro removido, modo SSL alterado, etc.), append
aqui com data e razão.

---

## Referências cruzadas

- `docs/runbooks/cloudflare-setup.md` — como reproduzir esta configuração do zero
- `docs/backlog/phase-0.md` P0-B2 — DoD original e notas de execução
- `PROJECT_BRIEF.md` §7.2 — defesa de borda (Cloudflare proxied + AOP planejado)
- ADR-0008 — pivot pra AWS EC2 (origem dos registros A)
- ADR-0006 — repo público (permite documentar valores aqui sem expor segredo;
  tokens **NUNCA** entram, só nome+localização)
