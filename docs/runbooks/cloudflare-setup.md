# Runbook — Cloudflare zone setup do zero

> **Para que serve este runbook:** reproduzir, do zero, a configuração de zona
> Cloudflare que sustenta a Fase 0 deste projeto. Útil pra recriar (se a conta
> sumir, se o domínio mudar, se for fork pra outro contexto), pra auditar, pra
> onboard de mais alguém. Cada passo lista qual item do DoD da P0-B2 satisfaz.
>
> **Última execução real desta sequência:** 2026-05-02 — registrada em
> `docs/infra/cloudflare.md` com os valores efetivamente escolhidos.
>
> **Não é cobertura completa de Cloudflare** — só os pedaços que P0-B2 e
> ADR-0008/0009 exigem. Page Rules, WAF Custom Rulesets, Workers, Turnstile
> e outros vivem em runbooks/PRs futuros (Grupo D).

---

## Pré-requisitos

- Conta AWS com **Elastic IP** alocado e associado à EC2 da plataforma
  (registrado em `docs/infra/aws-specs.md` — pendente de criação) — sem o IP
  estável, qualquer registro DNS criado vira lixo na primeira parada da EC2.
- Decisão sobre **registrar** (onde o domínio é registrado) e sobre **estratégia
  de zona** (full setup vs subdomain zone). Ver "Escolhas operacionais" abaixo.
- `dig` instalado localmente (Linux/macOS já vem; Windows via WSL).

---

## Escolhas operacionais (registradas para futuras revisões)

### Free tier vs upgrades

Cloudflare Free cobre **toda a Fase 0**:

- DNS proxied + CDN + WAF Managed Rulesets básicos
- Universal SSL (cert auto-emitido)
- Bot Fight Mode (heurística simples)
- Analytics básico
- Rate limiting limitado

Recursos que **exigem upgrade** (referência, não usados na Fase 0):

| Recurso                   | Plano mínimo   |
| ------------------------- | -------------- |
| **Subdomain zone setup**  | Enterprise     |
| **CNAME setup (Partial)** | Business       |
| Custom WAF rules          | Pro            |
| Page Rules >3             | Pro / Business |
| Image Resizing            | Pro            |

**Implicação prática:** _na free tier, a única forma de gerenciar DNS de um
domínio (ou subdomínio) via Cloudflare é "full setup" — adicionar a **zona
completa** do domínio no apex e mudar nameservers no registrar pra apontar pro
CF._ Tentar "Add a domain" com `subdominio.dominio.com` é **bloqueado pela UI**
em 2026-05.

Consequência da escolha do projeto: **comprar domínio dedicado** (`chatdelta.cloud`)
em vez de delegar subdomínio de domínio existente. Ver execução em
`docs/infra/cloudflare.md` e contexto em ADR-0008.

### Registrar — critérios

Onde comprar o domínio:

| Registrar                | Pró                                                                                    | Contra                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Cloudflare Registrar** | Preço at-cost (sem markup); registrar+DNS no mesmo painel; renovação automática segura | Não suporta todos TLDs (`.com`, `.dev`, `.app`, `.shop` ok; `.com.br` não) |
| **Hostinger**            | TLDs amplos (`.cloud`, `.com.br`, `.io`, etc); UI simples; barato no primeiro ano      | Markup na renovação; precisa trocar NS manualmente                         |
| **Registro.br**          | Único registrar autorizado pra `.br`; preços oficiais                                  | UI antiga; precisa trocar NS manualmente                                   |
| **Namecheap / Porkbun**  | TLDs amplos; bons preços                                                               | Mais um vendor pra gerenciar                                               |

Recomendação: **Cloudflare Registrar** quando o TLD for suportado; **Hostinger**
ou **Registro.br** caso contrário.

---

## Passo a passo

### 1. Criar conta Cloudflare (se ainda não tiver)

1. https://dash.cloudflare.com/sign-up
2. Email + senha forte (gerada por password manager)
3. Confirmar email
4. **Habilitar MFA imediatamente**: My Profile → Authentication → Two-Factor
   Authentication → Authenticator App. Use TOTP (1Password / Bitwarden / Aegis
   / Authy). Salve os **backup codes** no password manager.

> **DoD:** "Conta Cloudflare ativa (free tier)" ✅

### 2. Comprar/escolher o domínio

Critérios usados para o projeto:

- TLD com preço at-cost ou baixo (~ $10-15/ano)
- Naming curto, mnemônico, alinhado com o propósito (`*.cloud` para projeto
  cloud-native faz sentido)
- Disponibilidade verificada antes da compra

Se for usar Cloudflare Registrar: a compra já entrega o domínio com NS
apontando pro CF — pula o passo 5.

Se for usar registrar externo (Hostinger, Registro.br, etc.): registrar
normalmente, anotar onde o painel DNS está.

### 3. Adicionar a zona no Cloudflare (full setup)

1. Dashboard CF → top-right **+ Add** → **Connect a domain**
2. Em "Domain name" digite o **domínio raiz** (ex.: `chatdelta.cloud`)
   - **Não** funciona com subdomínio (ex.: `loja.chatdelta.cloud`) no free
     tier — UI bloqueia explicitamente
3. **Continue**
4. Plano → escolha **Free** → **Continue**
5. CF tenta importar registros DNS existentes. Pra domínio recém-comprado,
   tipicamente vem 0 ou poucos registros default (algum A apontando pra
   parking page do registrar, CNAME `www`).
6. **Continue** até a tela "Change your nameservers"

> **DoD:** "Zona criada para o domínio" ✅

### 4. Anotar os 2 nameservers atribuídos

CF atribui aleatoriamente 2 nameservers do tipo `<nome1>.ns.cloudflare.com`.
Anotar os nomes exatos — você vai precisar no próximo passo.

Exemplos de execuções passadas:

- `marty.ns.cloudflare.com` + `destiny.ns.cloudflare.com` (chatdelta.cloud)

### 5. Atualizar nameservers no registrar

#### 5a. Hostinger (hPanel)

1. Login em https://hpanel.hostinger.com/
2. Sidebar/Topo → **Domínios** (ou "Domains")
3. Clica no domínio
4. Seção **DNS / Nameservers**
5. **Change nameservers** → seleciona **Use custom nameservers**
6. Preenche `NS1` e `NS2` com os valores do passo 4
7. **Save**

#### 5b. Registro.br

1. Login em https://registro.br
2. Painel → Meus Domínios → o domínio → **Servidores DNS**
3. **Editar** → marca "Definir DNS" (Manual)
4. Substituir `ns01.dnsbr.org` etc. pelos NS do Cloudflare
5. **Salvar**

#### 5c. Cloudflare Registrar

Não precisa — comprado dentro do CF, NS já aponta pro próprio CF.

### 6. Verificar propagação

```bash
dig +short NS <dominio> @1.1.1.1
dig +short NS <dominio> @8.8.8.8
dig +short SOA <dominio> @1.1.1.1
```

Esperado em **5-30 min** depois da troca:

- Os 2 NS do CF aparecem em ambos resolvers (Cloudflare + Google)
- SOA é authoritative em um dos NS do CF (`<x>.ns.cloudflare.com.`)

Se ainda mostrar NS do registrar antigo, aguarda mais alguns minutos
(alguns registrars demoram até 24h, mas Hostinger/CF Registrar costumam
ser quase instantâneos).

### 7. Aguardar zona virar Active

CF tem polling interno: alguns minutos depois da propagação real, o badge
no topo da zona muda de **🟡 Pending Nameserver Update** pra **🟢 Active**.
Email de confirmação chega no email da conta.

> **DoD:** "Zona criada para o domínio (decidir/comprar/apontar nameservers)" ✅

### 8. Limpar registros default + adicionar registros do projeto

Aba **DNS → Records**.

#### 8a. Editar/deletar registros default importados

Dependendo do registrar, CF pode ter importado:

- A record do apex (ex.: `dominio.cloud → 2.57.91.91` — IP do parking page do
  registrar). **Editar** content pra apontar pro **Elastic IP da EC2** (não
  deletar — preserva proxy state).
- CNAME `www → dominio.cloud` (padrão útil). **Manter**.
- Outros (MX padrão de email, etc.) — manter se forem do registrar pra hospedar
  email; deletar se forem placeholders.

#### 8b. Adicionar registros do projeto

Para a estrutura standard "1 prod + 1 staging + 2 admins", adicionar 3 registros A
(o apex já foi editado em 8a):

| Type | Name              | IPv4 address | Proxy   | TTL  | Comentário              |
| ---- | ----------------- | ------------ | ------- | ---- | ----------------------- |
| A    | `staging`         | `<EIP>`      | Proxied | Auto | EC2 EIP — staging       |
| A    | `traefik.staging` | `<EIP>`      | Proxied | Auto | Traefik admin — staging |
| A    | `grafana.staging` | `<EIP>`      | Proxied | Auto | Grafana admin — staging |

**TODOS proxied** (laranja) — origem fica escondida; brief §7.2 exige.

#### 8c. Verificar via dig

```bash
dig +short A <dominio> @1.1.1.1
dig +short A staging.<dominio> @1.1.1.1
dig +short A traefik.staging.<dominio> @1.1.1.1
dig +short A grafana.staging.<dominio> @1.1.1.1
```

Esperado:

- Cada query retorna **2 IPs Cloudflare** (ranges `104.21.0.0/20`,
  `172.67.0.0/16`, ou similares — sempre IPs do CF, **nunca** o EIP)
- Sanity: `dig +short A naoexiste.<dominio>` retorna vazio (NXDOMAIN)

Se algum query retornar o EIP (`32.x.x.x` direto), o registro está como
**DNS only** (nuvem cinza) — clica e troca pra Proxied (nuvem laranja).

> **DoD:** "Registros A iniciais (placeholders apontando para o IP)" ✅

### 9. SSL/TLS — modo Full (Strict)

Aba **SSL/TLS → Overview**.

CF default (2026): "Automatic mode" tenta picar o melhor. Pra ter controle
explícito, **disable Automatic** primeiro, depois muda manualmente:

1. Configure / clica no modo atual
2. Lista de modos:
   - Off
   - Flexible _(deprecated, inseguro — não use)_
   - Full _(HTTPS, mas aceita qualquer cert no origin — partial)_
   - **Full (strict)** _(às vezes labelado "Strict (SSL only)" na UI nova)_ ← **escolha**
3. Save

> **Trade-off conhecido:** até P0-D3 (Let's Encrypt no Traefik), origem não
> tem cert e qualquer hit retorna **525/526**. Phase 0 sem tráfego real =
> sem visibilidade externa do erro. Aceito.

> **DoD:** "SSL/TLS modo Full (Strict)" ✅

### 10. HSTS — configuração conservadora

⚠️ **Leitura obrigatória:** HSTS é response header que faz browser memorizar
"esse domínio sempre HTTPS". **Uma vez cacheado, não dá pra desligar
remotamente** — browser respeita o cache até `max-age` expirar. Por isso,
ramp-up em estágios.

Path:

1. **SSL/TLS → Edge Certificates** → role até o final
2. Card **HTTP Strict Transport Security (HSTS)** → **Enable HSTS**
3. CF mostra modal com 4 disclaimers (são reais — leia, marque)
4. Configure:

| Opção                           | Valor inicial recomendado | Razão                                                                                       |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| Enable HSTS                     | **On**                    | DoD exige                                                                                   |
| Max Age Header (max-age)        | **1 month**               | Conservador. Ramp pra 6mo → 1yr → 2yr ao longo de meses                                     |
| Apply HSTS policy to subdomains | **Off**                   | Phase 0 = experimentação. Ligar agora bloqueia subdomínio futuro em HTTP                    |
| Preload                         | **Off**                   | **NUNCA ligar antes de 6+ meses estável.** Submissão à preload list é irreversível em meses |
| No-Sniff Header                 | **On**                    | Defense in depth — manda `X-Content-Type-Options: nosniff` (independente de HSTS)           |

5. **Save**

**Plano de ramp futuro** (não fazer agora; documentar pro futuro):

```
Mês 0:    HSTS On, max-age=1mo, no subdomains, no preload  ← ESTAMOS AQUI
Mês 1:    Validar HTTPS estável, considerar max-age=6mo
Mês 3-6:  max-age=1yr; ligar includeSubDomains se TUDO estiver HTTPS
Ano 1+:   max-age=2yr; submeter preload list em hstspreload.org
```

> **DoD:** "HSTS habilitado" ✅

### 11. Bot Fight Mode

Path:

1. Sidebar zona → **Security**
2. Sub-item → **Bots**
3. Card **Bot Fight Mode** → toggle **On**

(UI alternativa: **Security → Settings**, com toggle Bot Fight Mode entre
outros.)

Sem trade-off relevante na Fase 0 — heurística leve, bloqueia/desafia bots
óbvios; good bots (Googlebot etc.) passam por allowlist mantida pelo CF;
logs em **Security Events**.

> **DoD:** "Bot Fight Mode habilitado" ✅

### 12. API Token escopado

Path:

1. Top-right avatar → **My Profile** → sidebar **API Tokens**
2. **Create Token**
3. Use template **"Edit zone DNS"** (ou Custom Token com permissions equivalentes)
4. Configuração:

| Campo                       | Valor                                                        |
| --------------------------- | ------------------------------------------------------------ |
| Token name                  | `opentofu-<dominio>-dns`                                     |
| Permissions                 | `Zone:Read` + `Zone:DNS:Edit`                                |
| Zone Resources              | **Include → Specific zone → `<dominio>`** ⚠️ NÃO "All zones" |
| Client IP Address Filtering | (vazio por enquanto; restrição vem com OIDC/GitHub Actions)  |
| TTL                         | Sem expiração (rotacionar manualmente quando precisar)       |

5. **Continue to summary** → confere → **Create Token**
6. **Tela de uma vez** mostra o token. **Critical hygiene:**
   - **NÃO** colar o token em chat / arquivo do repo / log
   - **NÃO** commitar o token (gitleaks pega `Bearer` patterns mas não teste)
   - **Salvar imediatamente** em **password manager** (1Password / Bitwarden /
     Aegis / KeePass) com nome descritivo: "Cloudflare API Token —
     opentofu-<dominio>-dns"
   - Opcional: também salvar como **GitHub Secret** (`CLOUDFLARE_API_TOKEN_DNS`)
     pra uso futuro em Actions
7. Botão **Test** na tela faz GET com o token e retorna metadata — vale clicar
   pra confirmar funcionalidade

> **Princípio:** least privilege — DNS:Edit + Zone:Read é o mínimo pra OpenTofu
> gerenciar registros DNS (P0-D1). Quando precisar mexer em SSL/HSTS/Bot Fight
> via OpenTofu (atualmente toggles manuais), criar **token separado** ou
> expandir esse, sempre registrando a expansão.

> **DoD:** "Token de API criado (escopo mínimo de zona)" ✅

### 13. Registrar valores no `docs/infra/cloudflare.md`

Atualizar `docs/infra/cloudflare.md` com:

- Domínio escolhido + registrar
- Cloudflare Account ID + Zone ID
- 2 nameservers atribuídos
- Lista atual de registros DNS
- Configuração SSL/TLS (modo + data de mudança)
- Configuração HSTS (max-age + flags)
- Estado Bot Fight Mode
- Nome dos API tokens criados + onde estão armazenados (NÃO o valor)

Esse arquivo vira o "estado em ASCII" da zona, complementar ao "estado em IaC"
que P0-D1 vai criar.

---

## Recovery — situações onde voltar aqui

| Situação                                                                   | Pular para                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Domínio mudou (compra novo)                                                | Passo 2                                                             |
| Migrou registrar                                                           | Passo 5                                                             |
| Conta Cloudflare comprometida                                              | Passo 1 (criar nova) + 12 (revogar tokens antigos)                  |
| EIP da EC2 mudou                                                           | Passo 8 (reapontar registros)                                       |
| Quer adicionar mais subdomínio                                             | Passo 8b (adicionar +1 registro A proxied)                          |
| Quer reverter HSTS (não consegue mais — só pode reduzir max-age e esperar) | Passo 10                                                            |
| Token vazou                                                                | Passo 12 (revogar antigo, criar novo, atualizar onde estiver usado) |

---

## Próximas tarefas que dependem desta

- **P0-D1** — OpenTofu vai importar a zona, registros, e configurações (SSL,
  HSTS, Bot Fight) pra state IaC. Tag `ManagedBy=manual` muda pra `terraform`
  no PR de import.
- **P0-D2 a P0-D5** — Traefik na origem, Let's Encrypt automático, Authenticated
  Origin Pulls (mTLS Cloudflare → origem), security headers via middleware.
  Quando esses estiverem prontos, a flag SSL/TLS Full (Strict) finalmente
  começa a fazer trabalho útil (origem responde HTTPS válido).
- **Eventual ramp HSTS** — quando passar 1 mês com tudo estável, considerar
  subir max-age e ligar includeSubDomains.

---

## Referências

- `PROJECT_BRIEF.md` §7.2 (defesa de borda — Cloudflare proxied + AOP planejado)
- `docs/backlog/phase-0.md` P0-B2 (DoD original)
- `docs/infra/cloudflare.md` (valores efetivamente escolhidos da última execução)
- ADR-0006 (cutover repo público — relevante porque permite docs detalhadas
  como esta sem expor segredo)
- ADR-0008 (AWS EC2 efêmera — fonte da EIP que vai nos registros A)
- [Cloudflare Docs — DNS setups](https://developers.cloudflare.com/dns/zone-setups/)
- [Cloudflare Docs — HSTS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)
- [Cloudflare Docs — Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/free/)
- [Cloudflare Docs — API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
