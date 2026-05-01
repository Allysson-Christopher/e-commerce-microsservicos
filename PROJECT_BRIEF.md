# PROJECT BRIEF — E-commerce Microsserviços

> **Versão:** v1.0 (consolidada em 2026-04-29)
> **Status:** aprovada pelo proprietário do projeto
> **Tipo:** documento vivo — versões futuras incrementam conforme o projeto evolui (`v1.x` para refinamentos, `v2.0` para mudanças estruturais)
> **Construção:** entrevista estruturada com 30 perguntas cobrindo visão, domínio, arquitetura, stack, DevOps, observabilidade, segurança, frontend e plano de execução
>
> **Objetivo do projeto:** e-commerce moderno, profissional e completo, com fins reais e educacionais (foco em microsserviços, DevOps e **segurança com pentest mindset**).
>
> **Contexto do executor:** desenvolvedor solo utilizando Claude Code, hospedando em VPS única da Hostinger com staging e prod isolados.

---

## 0. Princípios Transversais (Cross-cutting)

### 0.1 Segurança como prioridade de primeira classe
Decisão explícita do usuário: segurança é **prioridade de implementação E de aprendizado**, **com a premissa de que o sistema será submetido a pentest profissional**.

**Implicações práticas:**
- **Threat modeling antes de cada feature crítica** — identificar superfícies de ataque, atores, ativos a proteger e vetores antes de codar (STRIDE/PASTA leve)
- **Pentest mindset** — projetar e revisar código pensando "como eu invadiria isso?"
- **OWASP Top 10 (Web e API)** como checklist obrigatório em todo PR que toca caminho público
- **OWASP ASVS Nível 2** como meta de conformidade do sistema final
- **Defense in depth** — nenhuma camada confia totalmente em outra (gateway valida, serviços re-validam, banco impõe constraints, WAF na borda)
- **Princípio do menor privilégio** em todos os contextos: tokens, banco, IAM, k8s ServiceAccounts, secrets
- **Zero trust interno** — serviço a serviço autenticado e (em fase 2+) autorizado via mTLS / SPIFFE
- **Privacy by design** — LGPD: minimização de dados, criptografia em repouso e em trânsito, finalidade clara, direito ao esquecimento implementável
- **PCI-DSS-aware** — não armazenar dados de cartão (delegar 100% ao gateway), tokenização, segregação de logs sensíveis
- **Logging seguro** — nunca logar PII/PAN/token; sanitização explícita; auditoria separada
- **Headers de segurança modernos** — CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy obrigatórios
- **Rate limiting e proteção contra abuso** — em todas as APIs públicas, com regras específicas para login/registro/checkout
- **Idempotência** — não só por correção funcional, mas para resistir a replay attacks
- **Auditoria** — trilha de auditoria imutável para ações sensíveis (login, mudança de senha, criação/alteração de pedido, devolução, alteração de role)
- **Testes de segurança no CI** — Semgrep + Trivy + gitleaks + Checkov + ZAP/Nuclei (a definir) integrados como gate
- **Pentest interno periódico** — exercícios de auto-pentest documentados antes de cada release maior
- **Hardening sistemático** — VPS, contêineres (rootless, read-only FS, drop capabilities), k8s (PodSecurityStandards, NetworkPolicies)
- **Resposta a incidentes** — runbooks documentados para vazamento de credenciais, comprometimento de container, intrusão na VPS
- **Documentação como atestado** — `SECURITY.md`, `THREAT_MODEL.md`, política de divulgação responsável (`security.txt`)

**Cada decisão técnica futura deste documento deve ser revisitada com a lente de segurança.** Onde já houver decisões anteriores, complementaremos com camadas de segurança quando atacarmos cada subsistema.

---

## 1. Visão & Escopo

### 1.1 Tipo de e-commerce
**Escolha:** B2C de nicho (opção 2)
- Catálogo focado, marca única
- Complexidade controlada, mas todos os conceitos de microsserviços e DevOps continuam aplicáveis

### 1.2 Nicho
**Escolha:** Moda / vestuário (opção 1)
- Produtos com variação de tamanho e cor → modelagem rica de SKU/variantes
- Carrinho com atributos selecionáveis
- Gestão de estoque por SKU (combinação tamanho × cor)
- Devoluções e troca como parte natural do fluxo
- Possibilidade de explorar recomendação por estilo/preferências

### 1.3 Escala alvo (design target)
**Escolha:** Médio / startup early (opção 2)
- ~1k usuários simultâneos, ~10k pedidos/dia
- Justifica naturalmente: cache distribuído, réplicas de leitura, fila para picos, autoscaling básico, circuit breakers
- Permite exercitar ~80% dos conceitos de DevOps/microsserviços sem cair em overengineering
- Estratégia: alguns serviços críticos (catalog, search, checkout) podem ser **projetados** pensando em nível 3 mesmo que implementados em nível 2 — exercitar pensamento de escala diferenciada por serviço

### 1.4 Escopo funcional (alvo final)
**Escolha:** E-commerce completo (opção 3)

**Features alvo:**
- Catálogo, carrinho, checkout, pedidos, auth (do MVP)
- Busca/filtros (motor de busca dedicado)
- Gestão de estoque real
- E-mails transacionais
- Painel admin
- Gateway de pagamento real (sandbox)
- Cupons / promoções
- Frete (cálculo via API mock ou Correios sandbox)
- Reviews / avaliações
- Wishlist
- Recomendação básica
- Devoluções
- Notificações multicanal (e-mail + push)

**Estimativa:** ~9-11 microsserviços ao final

**Estratégia de execução:** incremental
- Fase 1: MVP mínimo (~4-5 serviços) — exercita ciclo completo de DevOps
- Fase 2: essenciais (busca, estoque, admin, gateway real)
- Fase 3: completar features (cupons, frete, reviews, wishlist, devoluções, notificações)

Cada fase é uma **release real** (`v0.x` → `v1.0` ao final), exercitando versionamento, deploy, rollback, changelog automático.

**Conceitos exercitados:** sagas distribuídas (checkout multi-serviço), eventual consistency (estoque ↔ pedido), CQRS (catalog leitura vs escrita), fanout de eventos (pedido criado → estoque, e-mail, fidelidade, analytics), comunicação síncrona vs assíncrona em cenários reais.

---

## 2. Domínio & Funcionalidades

### 2.1 Estratégia de decomposição em microsserviços
**Escolha:** Híbrido pragmático (opção 5)

- **Macro-decomposição por capacidade de negócio** — listar capacidades (vender, catalogar, estocar, cobrar, entregar, notificar, autenticar) e cada uma vira candidata a serviço
- **DDD tático** aplicado seletivamente nos serviços com regra de negócio rica (ex.: Order Service com agregado de pedido e máquina de estados; Inventory com regras de reserva/liberação)
- **CRUD honesto** quando o serviço for de fato CRUD (ex.: Address, Profile) — sem forçar DDD onde não cabe
- Aceitar inconsistência de padrão entre serviços como reflexo da realidade — saber **quando** aplicar cada técnica é parte do aprendizado

**Próximo passo:** event storming leve e textual para mapear os bounded contexts antes de fixar a lista de serviços.

### 2.2 Granularidade dos bounded contexts
**Escolha:** Granularidade média (opção 2) — ~10-12 serviços

**Lista preliminar de serviços (a ser refinada):**
- `catalog-service` — produtos, categorias, variantes (read-heavy, candidato a CQRS)
- `inventory-service` — estoque por SKU, reservas (regras críticas, máquina de estados de reserva)
- `pricing-service` — preços, promoções, cupons (estratégia de cálculo)
- `cart-service` — carrinho ativo (key-value, alta frequência, TTL)
- `checkout-service` — orquestração de saga (estoque → pagamento → frete → pedido)
- `order-service` — ciclo de vida do pedido (máquina de estados, histórico)
- `payment-service` — integração com gateway, idempotência, retentativas
- `shipping-service` — cálculo de frete e rastreamento (mock ou sandbox)
- `notification-service` — e-mails transacionais, push (consome eventos)
- `identity-service` — auth, JWT/refresh, sessões
- `customer-service` — perfil, endereços, wishlist
- `review-service` — avaliações de produtos

**Justificativa:**
- Cobre praticamente todos os padrões importantes (saga, CQRS, event sourcing seletivo, BFF, gateway, circuit breaker)
- Reflete o que empresas de e-commerce de porte médio realmente operam
- Implementável em tempo razoável (refletindo o plano incremental por fases)
- Lista pode ser refinada e ajustada nas próximas perguntas

### 2.3 Estilo de comunicação inter-serviços
**Escolha:** Event-driven seletivo (opção 3)

**Regras de uso:**
- **REST (síncrono)** para queries pontuais entre serviços (ex.: `checkout-service` consultar `pricing-service` para cálculo no momento do checkout)
- **Eventos assíncronos** para toda mudança de estado que outros contextos precisam saber (ex.: `OrderCreated`, `PaymentApproved`, `StockReserved`, `StockReleased`, `OrderConfirmed`, `OrderCancelled`)
- **Saga orquestrada** no checkout (orquestrador: `checkout-service`) coordenando estoque → pagamento → confirmação → notificação
- **Outbox pattern** para garantir publicação confiável de eventos após commit transacional local

**Padrões a exercitar:**
- Outbox pattern (DB transaction + publicação confiável de evento)
- Sagas distribuídas (orquestrada inicialmente; coreografada como exercício futuro)
- Eventual consistency entre carrinho, estoque, pedido
- Idempotência de consumers (event id + dedup table)
- Dead Letter Queue (DLQ) para falhas permanentes
- Retry com backoff exponencial em consumers e clients HTTP
- Circuit breaker em chamadas REST inter-serviço

**Decisões adiadas (introduzir depois como exercício):**
- gRPC para queries internas (substituir REST seletivamente em fase mais avançada)
- Service mesh (Istio/Linkerd) — só após Kubernetes estar maduro no projeto
- Event sourcing pleno — não será adotado; eventos são mecanismo de comunicação, não a fonte de verdade do estado

### 2.4 Estratégia de dados (database per service)
**Escolha:** Híbrido pragmático (opção 5)

**Princípios:**
- Database per service estrito — nenhum serviço acessa o banco do outro diretamente; integração só via API ou eventos
- Polyglot persistence onde houver ganho técnico real, não diversidade artificial
- Schema/database lógico separado mesmo quando o engine é o mesmo (ex.: instância única de PostgreSQL com vários databases)

**Mapeamento inicial de bancos por serviço:**

| Serviço | Banco | Justificativa |
|---------|-------|---------------|
| `order-service` | PostgreSQL | transacional, relacional, máquina de estados |
| `payment-service` | PostgreSQL | transacional + auditoria |
| `inventory-service` | PostgreSQL | transacional, lock para reservas |
| `customer-service` | PostgreSQL | dados estruturados |
| `identity-service` | PostgreSQL | usuários, sessões, refresh tokens |
| `pricing-service` | PostgreSQL | regras + cupons |
| `review-service` | PostgreSQL | avaliações + relacionamento com produto/cliente |
| `shipping-service` | PostgreSQL | cotações, rastreamento |
| `notification-service` | PostgreSQL | log de envios e templates (apenas auditoria) |
| `catalog-service` | PostgreSQL com JSONB (fase 1) → migrar p/ MongoDB se justificar (fase 2+) | produtos com atributos variáveis; começar simples |
| `cart-service` | Redis | carrinho ativo, TTL natural, alta frequência key-value |
| `search-service` | Elasticsearch / OpenSearch | busca facetada, fuzzy, autocomplete, relevância |

**Infraestrutura de dados adicional:**
- **Redis** — também usado como cache distribuído e dedup de eventos (idempotency keys)
- **S3 / MinIO** — storage de imagens de produto (MinIO em dev/staging para evitar custo)

**Conceitos a exercitar:**
- Database per service estrito (sem JOIN entre serviços)
- Polyglot persistence (justificada)
- Migrations isoladas por serviço (cada serviço gerencia seu próprio schema)
- Read replicas (introduzir quando houver gargalo de leitura — exercício planejado)
- Backup e restore por banco
- Outbox table dentro do mesmo DB transacional (parte do outbox pattern já decidido)

---

## 3. Stack Tecnológica

### 3.1 Linguagens & frameworks (estratégia bi/triglota deliberada)
**Escolha:** Bi/triglota deliberado (opção 2)

**Distribuição por serviço:**

| Serviço | Linguagem / Framework | Motivo |
|---------|----------------------|--------|
| `order-service` | Java 21 + Spring Boot 3 | transacional crítico; ecossistema enterprise (JPA, Resilience4j, Spring Cloud Stream) |
| `payment-service` | Java 21 + Spring Boot 3 | crítico, idempotência, integração com gateway, auditoria |
| `inventory-service` | Java 21 + Spring Boot 3 | regras de reserva, locks, transações |
| `checkout-service` | Java 21 + Spring Boot 3 | orquestrador de saga; ecossistema Spring forte para isso |
| `identity-service` | Java 21 + Spring Boot 3 + Spring Security/Authorization Server | auth crítica, ecossistema maduro para JWT/OAuth2/OIDC |
| `catalog-service` | Node.js 22 + TypeScript + NestJS | produtivo, ótimo com JSONB/Mongo, alta produtividade |
| `cart-service` | Node.js 22 + TypeScript + NestJS | leve, alta frequência, integração natural com Redis |
| `customer-service` | Node.js 22 + TypeScript + NestJS | CRUD-ish, produtivo |
| `pricing-service` | Node.js 22 + TypeScript + NestJS | regras de preço/cupom, produtivo |
| `shipping-service` | Node.js 22 + TypeScript + NestJS | integração com APIs externas (mock/sandbox) |
| `review-service` | Node.js 22 + TypeScript + NestJS | CRUD-ish com agregações simples |
| `notification-service` | Node.js 22 + TypeScript + NestJS | consumer de eventos, integrações com SMTP/push |
| `search-service` (consumer de eventos do catálogo) | Node.js 22 + TypeScript + NestJS | integra com Elasticsearch |
| `api-gateway` / BFF | Go 1.23+ | alta concorrência, baixa latência, escopo controlado para aprender Go |

**Resumo:**
- **Java + Spring Boot:** 5 serviços (transacionais críticos + identity)
- **Node.js + TypeScript + NestJS:** 7-8 serviços (auxiliares, ágeis, integrações)
- **Go:** 1 serviço (gateway/BFF)

**Versões alvo:**
- Java: **21 LTS** (records, virtual threads, pattern matching)
- Node.js: **22 LTS** + TypeScript 5.x
- Go: **1.23+**

**Por que essa distribuição:**
- Exercita o ecossistema enterprise (Spring) — padrão de mercado em e-commerce/fintech BR
- Mantém produtividade alta nos serviços leves (Node/Nest)
- Introduz Go em escopo controlado (1 serviço) — aprendizado real sem risco de travar
- Reflete realidade profissional comum em times maduros

**Decisões adiadas:**
- Possível introdução de Python/FastAPI em fase posterior para `recommendation-service` (se for adicionado)
- Possível troca de Java por Kotlin (mesmo ecossistema Spring, mais ergonômico) — pode ser exercício futuro de "migração de stack"

### 3.2 Mensageria / broker de eventos
**Escolha:** Apache Kafka (opção 2)

**Configuração:**
- Modo **KRaft** (sem Zookeeper) — padrão moderno
- **Redpanda em dev/staging** (compatível com Kafka API, mais fácil de operar localmente) — código idêntico
- **Kafka real** (gerenciado ou self-hosted) em produção quando aplicável
- **Schema Registry** (Confluent ou Apicurio) para versionamento de contratos de eventos
- **Formato de payload:** Avro ou Protobuf (decisão a confirmar em pergunta dedicada de contratos)

**Por que Kafka:**
- Padrão de mercado em e-commerce / fintech moderna
- **Replay de eventos** — reconstruir estado e onboardar novos serviços (ex.: futuro `analytics-service` ou `recommendation-service` consumindo histórico de `OrderCreated`)
- Throughput alto, particionamento natural
- Idempotência e ordering por chave de partição (ex.: orderId como chave → todos os eventos do mesmo pedido na mesma partição em ordem)
- Compaction para tópicos de "estado atual" (ex.: catálogo)

**Padrões a exercitar:**
- **Outbox pattern** com publicação confiável (a partir de tabela outbox transacional → Kafka)
- **CDC opcional** (Debezium) para casos específicos como exercício avançado
- **Consumer groups** e rebalanceamento
- **Partitioning** por chave (orderId, customerId) garantindo ordem e idempotência
- **DLQ** (dead letter topic) para falhas permanentes
- **Retry topic** com backoff (padrão "exponential backoff via tópicos escalonados")
- **Schema evolution** (adicionar campo opcional, depreciar campo, breaking changes)
- **Compaction** (tópico de "produto atual" derivado dos eventos de catálogo)
- **Idempotência de consumers** via dedup table + event id

**Observabilidade do broker:**
- Métricas Kafka via JMX exporter → Prometheus
- Lag de consumer groups monitorado (alarme quando atrasa)
- UI para inspeção: Kafka UI (Provectus), Redpanda Console ou Kafdrop em dev

### 3.3 Contratos de eventos e APIs
**Escolha:** OpenAPI + Protobuf + Schema Registry (opção 3)

**REST público (clientes externos e gateway):**
- OpenAPI 3 como contrato versionado
- Estratégia inicial: **contract-first** (escrever YAML antes do código), gerar tipos com **openapi-generator**
- Em serviços Java/Spring, alternativamente permitir geração do OpenAPI a partir do código (springdoc) — decisão por serviço, mas o YAML versionado no repositório é a fonte da verdade
- Versionamento de API por **URI prefix** (`/v1/...`) — confirmar em pergunta dedicada se houver

**Eventos Kafka:**
- **Protobuf** como formato de payload
- **Schema Registry** (Apicurio em dev/staging; Apicurio ou Confluent em prod) como repositório central de schemas
- Contratos `.proto` versionados em diretório `contracts/` (mono-repo de contratos no início; eventual extração para repo dedicado em fase avançada)
- Geração de código com **buf** (`buf generate`) produzindo types Java, TypeScript e Go a partir dos `.proto`
- Validação de compatibilidade no CI com `buf breaking` (bloqueia PR se houver breaking change sem bump de versão)

**Estrutura proposta de contratos:**
```
contracts/
├── proto/
│   ├── ecommerce/
│   │   ├── catalog/v1/events.proto
│   │   ├── order/v1/events.proto
│   │   ├── payment/v1/events.proto
│   │   └── ...
│   └── buf.yaml
└── openapi/
    ├── catalog-service.yaml
    ├── order-service.yaml
    └── ...
```

**Conceitos a exercitar:**
- Contract-first development
- Geração de código a partir de contrato (clients e servers em 3 linguagens)
- **Schema evolution** — adicionar campo opcional, depreciar campo, lidar com breaking changes
- **Breaking change detection** automatizada no CI (buf breaking)
- **Compatibilidade FORWARD/BACKWARD/FULL** no Schema Registry
- Versionamento de tópicos Kafka com versão no nome (`order.v1.events`) ou no schema
- Schema registry subjects e estratégias (TopicNameStrategy, RecordNameStrategy)
- Consumer Driven Contract Tests (Pact) — exercício avançado

**Decisões adiadas:**
- Migração seletiva de REST interno para gRPC (mesmos `.proto` reaproveitados) — exercício de fase avançada
- Extração de `contracts/` para repositório dedicado quando o tamanho justificar

### 3.4 API Gateway / BFF
**Escolha:** Gateway + BFF combinados em duas fases (opção 5)

**Fase 1 (MVP) — apenas BFF em Go:**
- Serviço único `api-gateway` (também atua como BFF) escrito em Go (chi ou fiber)
- Responsabilidades:
  - Validação de JWT emitido pelo `identity-service`
  - Roteamento para serviços internos
  - **Agregação de dados** entre múltiplos serviços para reduzir round trips do cliente (ex.: `GET /home` agregando catalog + cart + recommendations)
  - Fan-out paralelo de chamadas (`golang.org/x/sync/errgroup`)
  - Rate limiting básico (por IP / por usuário)
  - CORS
  - Tradução de formatos (REST público JSON ↔ chamadas internas)
  - Propagação de trace context (W3C TraceContext)
- BFF é **único** no início (`bff-web`); criar `bff-admin` separado só se o painel admin justificar (decidir em fase 2+)

**Fase 2 — adicionar camada de Gateway propriamente dito:**
- Introduzir **Kong** (ou Traefik) na borda da rede como reverse proxy
- Concerns transversais movidos pro Kong:
  - TLS termination
  - Rate limiting avançado / quotas
  - WAF básico
  - mTLS interno opcional
  - Plugins (logging, transformações, autenticação centralizada)
- BFF em Go passa a ficar **atrás do Kong**, focado 100% em agregação e lógica de borda específica do cliente
- Kong substituível por Traefik se a fase incluir Kubernetes nativo (decisão na seção de infra)

**Conceitos a exercitar:**
- BFF pattern (agregação para cliente)
- Fan-out e composição de chamadas paralelas
- JWT validation distribuída (gateway valida, serviços confiam no claim)
- Propagação de contexto de tracing
- Rate limiting (token bucket, sliding window)
- Reverse proxy / API gateway management plane (Kong/Traefik)
- Diferença prática entre Gateway (rede) e BFF (composição)

**Decisões adiadas:**
- BFF múltiplo (`bff-mobile`, `bff-admin`) — só se justificar
- Service mesh (Istio/Linkerd) — quando Kubernetes maduro

---

## 4. Estrutura do Repositório

### 4.1 Monorepo único com `infra/` interno
**Escolha:** Monorepo único (opção 1 ajustada para dev solo + Claude Code)

**Contexto da escolha:**
- Desenvolvedor solo usando Claude Code
- Monorepo maximiza eficiência: refactor cross-service em 1 PR, contratos e consumers no mesmo lugar, Claude Code enxerga toda a base de uma vez
- Multi-repo agrega valor sobretudo com múltiplos times com fronteiras políticas — não é o caso

**Estrutura proposta:**
```
ecommerce/
├── services/
│   ├── order-service/         (Java/Spring Boot)
│   ├── payment-service/       (Java/Spring Boot)
│   ├── inventory-service/     (Java/Spring Boot)
│   ├── checkout-service/      (Java/Spring Boot)
│   ├── identity-service/      (Java/Spring Boot)
│   ├── catalog-service/       (Node/TS/NestJS)
│   ├── cart-service/          (Node/TS/NestJS)
│   ├── customer-service/      (Node/TS/NestJS)
│   ├── pricing-service/       (Node/TS/NestJS)
│   ├── shipping-service/      (Node/TS/NestJS)
│   ├── review-service/        (Node/TS/NestJS)
│   ├── notification-service/  (Node/TS/NestJS)
│   ├── search-service/        (Node/TS/NestJS)
│   └── api-gateway/           (Go)
├── contracts/
│   ├── proto/                 (buf gera código pra Java, TS, Go)
│   ├── openapi/
│   └── buf.yaml
├── frontend/
│   └── web/
├── infra/                     (tudo aqui no início)
│   ├── terraform/
│   ├── k8s/                   (manifests/Helm)
│   └── docker/                (Dockerfiles base, configs)
├── libs/                      (libs internas — só se justificar)
├── tools/                     (scripts dev, gen, seed)
├── go.work                    (workspace Go)
├── package.json               (npm workspaces para serviços Node)
├── docker-compose.yml
├── docker-compose.staging.yml
├── Makefile                   (make dev, make test, make gen, make up)
├── .github/
│   └── workflows/             (CI com path filters por serviço)
├── README.md
├── PROJECT_BRIEF.md           (este documento)
└── .gitignore
```

**Tooling de monorepo (filosofia "começar simples"):**
- **Sem Nx / Turborepo / Bazel no início** — só scripts shell + Makefile
- Builds nativos por linguagem:
  - Java: cada serviço com seu `pom.xml` (Maven) standalone — sem multi-module pai (mais simples de raciocinar)
  - Node/TS: **npm workspaces** com `package.json` raiz orquestrando
  - Go: **go.work** unificando os módulos Go
- **Path filters** no GitHub Actions para rodar CI só no que mudou
- Introduzir Nx/Turborepo **só se** a dor justificar (build cache, etc) — adiado como exercício futuro

**Critérios futuros para "promover" partes a repos separados:**
- Expor `contracts/` para terceiros consumirem
- Infra crescer ao ponto de exigir repo dedicado (e exercitar GitOps com repo de manifests separado)
- Build do monorepo passar de ~10 min sem cache
- Open source de parte do projeto

**Conceitos a exercitar:**
- Monorepo poliglota (Java + Node + Go) com builds nativos
- Path filters em CI (rodar só o que mudou)
- npm workspaces, go.work
- Geração de código a partir de contratos compartilhados (`contracts/` → 3 linguagens)
- Versionamento sincronizado vs independente entre serviços (decisão futura quando atacarmos versionamento)

---

## 5. DevOps — Versionamento & Releases

### 5.1 Estratégia de versionamento
**Escolha:** Versão independente por serviço (opção 2)

**Princípios:**
- Cada serviço tem **seu próprio ciclo de release**, changelog, tags e versão SemVer
- Deploy independente é o ponto de microsserviços — versionamento reflete isso
- Versão pré-1.0 (`0.x.y`) durante desenvolvimento; promoção a `1.0.0` consciente quando o serviço estiver estável

**Conventional Commits com scope obrigatório:**
```
feat(order-service): adiciona campo discount
fix(payment-service): corrige idempotência em retry
feat(catalog-service)!: remove campo legacyCode (BREAKING)
chore(order-service): bump dependências
docs(catalog-service): atualiza README
chore(deps): bump deps globais (raro, sem scope = afeta tudo)
```

- O **scope** identifica o serviço afetado e direciona o release-please ao package correto
- Múltiplos serviços num único commit é evitado — preferir commits separados por scope
- `commitlint` + `husky` validam scope localmente; CI valida em PR

**Ferramenta de release:**
- **release-please em modo monorepo** (googleapis/release-please-action)
- Configurado em `release-please-config.json` listando todos os packages (1 entry por serviço)
- Abre **1 PR de release por serviço** quando há commits desde a última tag daquele serviço
- Merge do PR → cria tag → cria GitHub Release → dispara workflow de deploy do serviço afetado

**Formato de tags e imagens:**
- Tag Git: `order-service-v1.3.0`, `catalog-service-v0.8.2` (formato nativo do release-please)
- Imagem Docker: `ghcr.io/<owner>/order-service:1.3.0` + `ghcr.io/<owner>/order-service:latest`
- Nunca deploya `latest` em prod — sempre versão fixa; `latest` apenas para conveniência local

**Visibilidade de "que versão está em prod":**
- Cada serviço expõe endpoint `/version` retornando `{ "service": "order-service", "version": "1.3.0", "commit": "<sha>", "builtAt": "..." }`
- Argo CD UI (quando entrar k8s) mostra label de versão
- Dashboard simples (página estática ou serviço de "status") consultando os `/version` — exercício de fase posterior

**Pré-requisitos a configurar no setup inicial:**
- `commitlint` + `husky` no monorepo
- `release-please-config.json` e `.release-please-manifest.json`
- Workflow `release-please.yml` rodando em push na `main`

**Decisões adiadas:**
- Promoção a `1.0.0` por serviço — definir critério (estabilidade da API, quantidade de breaking changes desde início, etc) quando aproximar do marco
- Dashboard agregador de versões em produção
- "Release train" temporal (consolidação mensal de tudo que foi a prod) — não adotado; pode ser exercício futuro

### 5.2 Modelo de branching e fluxo de PR
**Escolha:** Trunk-based development (opção 1)

**Modelo:**
- Branch principal única: `main` (sempre deployable)
- Branches de feature curtas (≤ 1-2 dias): `feat/<service>-<slug>`, `fix/<service>-<slug>`, `chore/<slug>`
- PRs pequenos, mergeados frequentemente
- **Sem `develop`, sem `release/*`, sem GitFlow**

**Fluxo:**
1. `git checkout -b feat/order-service-add-discount`
2. Codifica → commit com Conventional Commits
3. Push → abre PR
4. CI roda (lint + test + build dos serviços afetados via path filters)
5. PR mergeado com **squash merge** (mantém histórico linear, título do PR vira commit message)
6. Push na `main` → CD para **staging** automático
7. release-please abre PR de release quando há commits desde a última tag de algum serviço
8. Merge do PR de release → cria tag → CD para **prod**

**Proteção da `main` (mesmo dev solo):**
- Exigir PR (proibido push direto)
- Exigir CI verde antes de mergear
- Apenas **squash merge** habilitado (sem merge commit, sem rebase merge) — histórico linear
- Auto-merge habilitado: PR mergeia sozinho quando CI fica verde
- Required status checks: CI (lint+test+build) + commitlint

**Disciplina de PR:**
- Conventional Commit no título do PR (commitlint valida no CI)
- Squash mantém o título como mensagem da `main`
- Self-review do diff antes de mergear (exercício didático): mesmo solo, ler o próprio PR como se fosse de outro

**Feature flags (consequência natural do trunk-based):**
- Features em progresso ficam atrás de flag desligada
- Permite mergear código incompleto sem expor ao usuário
- Decisão de ferramenta de feature flag em pergunta dedicada futura (Unleash, GrowthBook, ConfigCat, ou solução caseira)

**Nomenclatura de branches:**
- `feat/<service>-<short-desc>` — nova feature
- `fix/<service>-<short-desc>` — bug fix
- `chore/<desc>` — manutenção, deps, infra
- `docs/<desc>` — documentação
- `refactor/<service>-<desc>` — refactor sem mudança de comportamento

**Conceitos a exercitar:**
- Trunk-based development real (não nominal)
- Continuous Integration (mergea cedo e frequente)
- Feature flags como mecanismo de "merge ≠ release"
- Disciplina de commits atômicos e PRs pequenos
- Histórico linear via squash
- Branch protection rules como contrato com você mesmo

### 5.3 Plataforma de CI/CD
**Escolha:** GitHub Actions + ArgoCD em duas fases (opção 5)

**Fase 1 (MVP) — apenas GitHub Actions:**
- CI: lint, test, build, image push para GHCR (GitHub Container Registry)
- CD: deploy direto via API da plataforma de hospedagem inicial (Railway/Render/Fly.io — decisão em pergunta de hosting)
- Workflows organizados:
  - `ci-<linguagem>.yml` ou `ci-<service>.yml` — rodam em PR e push
  - `cd-staging.yml` — rodam em push em `main`, deploy automático
  - `cd-prod.yml` — rodam em release publicado, deploy manual com approval
  - `release-please.yml` — abre PRs de release
  - `contracts-check.yml` — buf breaking + openapi lint
- Path filters para rodar CI apenas dos serviços afetados
- **Runners hospedados pelo GitHub** (free tier; self-hosted adiado)
- Reusable workflows e composite actions para evitar duplicação entre serviços (especialmente útil em monorepo poliglota)
- Secrets organizados por **Environments** do GitHub (`staging`, `production`) com protection rules

**Fase 2 — introduzir ArgoCD (quando entrar Kubernetes):**
- ArgoCD observa diretório `infra/k8s/` (ou repo separado em fase ainda mais avançada)
- GitHub Actions passa a apenas **atualizar manifests** com a nova tag de imagem (kustomize edit / yq) e fazer commit
- ArgoCD detecta mudança e sincroniza no cluster (modelo **GitOps "pull"**)
- App-of-apps pattern para gerenciar múltiplos serviços
- Sync waves para ordenar dependências
- Auto-sync em staging, manual sync com approval em prod

**Conceitos a exercitar (Fase 1):**
- Workflows YAML, jobs, matrix builds (3 linguagens em paralelo)
- Composite actions e reusable workflows
- Path filters em monorepo
- Secrets management e GitHub Environments
- Manual approval gates (`environment` com required reviewers)
- Build matrix por serviço/linguagem
- Cache de dependências (Maven, npm, Go modules)
- OIDC authentication com cloud (sem secrets de longa duração)
- Image signing (cosign) — opcional na fase 1

**Conceitos a exercitar (Fase 2):**
- GitOps "pull-based" (ArgoCD/Flux puxam estado desejado)
- Diferença CI (push) vs CD (pull)
- Manifests declarativos como fonte da verdade
- Sync waves, hooks pré/pós sync
- Drift detection
- Rollback declarativo (revertendo o commit dos manifests)

**Decisões adiadas:**
- Self-hosted runners (custo/performance)
- Image signing (cosign) e SBOM
- Repo separado de manifests para GitOps (na transição para fase 2)
- Tekton/Argo Workflows para CI dentro do cluster — exercício avançado opcional

### 5.4 Containerização e orquestração (caminho de execução)

> **⚠️ Atualização (2026-05-01) — ver [ADR-0008](docs/adr/ADR-0008-migrar-de-vps-hostinger-para-aws-ec2-efemera.md) e [ADR-0009](docs/adr/ADR-0009-substituir-ssh-por-aws-ssm-session-manager.md):** durante a execução da Fase 0 a plataforma de execução foi migrada desta seção (VPS Hostinger única) para **AWS EC2 efêmera em `us-east-1`**, sob modelo "spin-up para desenvolver / terminate quando não precisar". Acesso administrativo via SSM Session Manager (zero portas inbound; sem SSH público). Conceitos didáticos da seção (capacity planning, networks isoladas, Traefik compartilhado, deploy via API, backups externos) **continuam válidos** — só muda o substrato (EC2 + EBS + Security Groups no lugar de VPS + ufw + IP fixo). A descrição original abaixo é preservada como registro de planejamento.

**Escolha (versão original — superseded por ADR-0008):** Caminho faseado em VPS única da Hostinger (recomendação A)

**Contexto:**
- VPS única da Hostinger hospedando **staging + prod** simultaneamente
- Plataformas managed (Railway/Fly/Render) descartadas — VPS já contratada
- Cada fase é um exercício didático de evolução de infra

**Fase 1 — Docker Compose na VPS, dois ambientes isolados:**
- Estrutura na VPS:
  ```
  ~/ecommerce/
  ├── staging/
  │   ├── docker-compose.yml
  │   ├── .env
  │   └── data/
  └── prod/
      ├── docker-compose.yml
      ├── .env
      └── data/
  ```
- **Networks Docker separadas** (`ecommerce-staging-net`, `ecommerce-prod-net`) — sem comunicação cross-ambiente
- **Reverse proxy compartilhado:** Traefik único na frente, com HTTPS automático (Let's Encrypt), roteando por subdomínio:
  - `meuapp.com` → containers de prod
  - `staging.meuapp.com` → containers de staging
  - Subdomínios admin (`kafka-ui.staging.meuapp.com`, etc) restritos via auth
- **Recursos limitados** via `deploy.resources.limits` por container:
  - Prod recebe ~70% da VPS
  - Staging recebe ~25%
  - Reserva ~5% para o sistema
- **Bancos isolados:** 2 instâncias de Postgres, 2 de Redis (uma por ambiente)
- **Kafka:** preferência por 2 clusters separados; se a VPS não aguentar, **1 Kafka compartilhado com namespacing por prefixo de tópico** (`prod.order.events`, `staging.order.events`) — aceitável com a ressalva de menor isolamento
- **Deploy:** GitHub Actions builda → push GHCR → SSH na VPS → `docker compose pull && docker compose up -d`
  - Push em `main` → deploy automático em staging
  - Release publicado → deploy em prod (com manual approval no GitHub Environment)
- **Backups:** dumps lógicos (`pg_dump`) periódicos para storage externo (S3/Backblaze B2 — barato)

**Fase 2 — k3s na mesma VPS:**
- Instalar **k3s** (Kubernetes leve da Rancher) na VPS — single-node cluster
- **2 namespaces:** `staging` e `prod`
- **NetworkPolicies** impedem comunicação cross-namespace
- **ResourceQuotas** limitam recursos por namespace (mesma proporção da fase 1)
- **Helm charts** por serviço (chart genérico parametrizável + values específicos de serviço)
- **Traefik** (ingress controller incluso no k3s) substituindo o Traefik standalone da fase 1
- **ArgoCD** instalado no cluster, observa `infra/k8s/` no monorepo (GitOps pull-based)
- Migração serviço a serviço (Strangler-style) — não migrar tudo de uma vez
- Manifests/charts versionados em `infra/k8s/`

**Fase 3 (futura) — multi-nó ou cluster gerenciado:**
- Adicionar 1 VPS extra como nó k3s adicional (HA real) **ou**
- Migrar para cluster gerenciado (DOKS, GKE Autopilot) — exercício de migração de plataforma
- Decisão tomada quando a aplicação justificar (HA, autoscaling, ML pipelines)

**Dev local em todas as fases:**
- **Docker Compose** (caminho principal, rápido)
- Exercício pontual com **kind + Tilt** num momento dedicado para experimentar dev k8s-native (sem virar cotidiano)

**Configurações da VPS Hostinger:**
- Swap configurado (a VPS é limitada em RAM)
- Firewall restritivo: apenas 22 (SSH), 80, 443 expostas
- Bancos, Kafka, Redis acessíveis **apenas dentro da VPS**
- HTTPS via Let's Encrypt automático (Traefik na fase 1, cert-manager na fase 2)
- DNS via Cloudflare (free tier) com subdomínios apontando para a VPS

**Riscos conscientes desta abordagem:**
- 1 VPS = sem HA real (queda derruba ambos os ambientes)
- Staging consumindo CPU pode afetar prod (mitigado por resource limits)
- Reboot da VPS afeta os dois ambientes simultaneamente
- Estes riscos são **didaticamente aceitáveis** e tratáveis em fase futura (multi-nó / migração)

**Conceitos a exercitar (Fase 1):**
- Docker, Docker Compose multi-ambiente
- Traefik com Let's Encrypt automático
- Resource limits e capacity planning em recurso compartilhado
- Deploy via SSH automatizado por GitHub Actions
- Healthchecks, restart policies, dependency ordering em Compose
- Backup e restore de bancos (dump lógico + storage externo)
- Hardening básico de VPS (firewall, SSH key-only, fail2ban)

**Conceitos a exercitar (Fase 2):**
- k3s instalação e operação
- Helm charts (templates, values, releases)
- Namespaces, NetworkPolicies, ResourceQuotas
- Ingress controller, TLS via cert-manager
- ArgoCD: GitOps, app-of-apps, sync waves
- Migração graduada (Strangler) de Compose para k8s
- Autoscaling (HPA básico)

**Conceitos a exercitar (Fase 3 — futura):**
- Multi-nó k3s ou migração para cluster gerenciado
- HA real, drain de nós, manutenção sem downtime
- StorageClass e Persistent Volumes em cluster
- Service mesh (Istio/Linkerd) — opcional

### 5.5 Infraestrutura como Código (IaC)
**Escolha:** Híbrido faseado (opção 7) — Ansible + OpenTofu (Terraform OSS)

**Ferramentas:**
- **OpenTofu** (fork open-source do Terraform) — 100% compatível, conhecimento transferível para Terraform
- **Ansible** — configuração da VPS Hostinger (provisionamento de software/SO)
- **Helm + ArgoCD** — declarativo para k8s (fase 2+)

**Fase 1:**
- **Ansible playbooks** para configuração da VPS:
  - Instalar Docker e Docker Compose plugin
  - Instalar e configurar Traefik (reverse proxy compartilhado staging+prod)
  - Configurar firewall (`ufw`) — apenas 22, 80, 443 expostas
  - Configurar `fail2ban`
  - Criar usuário `deploy` (sem sudo) e configurar SSH key-only
  - Desabilitar SSH password auth e root login
  - Configurar swap (a VPS é limitada em RAM)
  - Configurar timezone, NTP, logrotate
  - Instalar agente de observabilidade (a definir em pergunta dedicada)
- **OpenTofu** apenas para Cloudflare:
  - Zona DNS
  - Registros A/AAAA para `meuapp.com` e `staging.meuapp.com` (e subdomínios admin)
  - Configurações de proxy/SSL/cache no Cloudflare
  - WAF rules básicas
- **Compose files** versionados em `infra/docker/`
- Variáveis sensíveis em **Ansible Vault** ou em GitHub Secrets (descrito em pergunta de secrets)

**Fase 2:**
- **Ansible** continua mantendo a VPS (k3s install, manutenção)
- **OpenTofu** expande:
  - Cloudflare (DNS, page rules, WAF)
  - Bucket de backup (Backblaze B2 ou S3) para dumps de banco e artefatos
- **Helm charts** por serviço (chart genérico parametrizável + values específicos)
- **ArgoCD** observa `infra/k8s/` (GitOps pull-based) — substitui o "deploy via SSH" para os serviços migrados

**Fase 3 (futura):**
- OpenTofu provisiona cluster gerenciado (DOKS/GKE Autopilot) se houver migração
- Provisiona redes, IAM, storage, certificados gerenciados

**Estrutura no monorepo:**
```
infra/
├── ansible/
│   ├── playbooks/
│   │   ├── bootstrap.yml         (configuração inicial da VPS)
│   │   ├── docker.yml
│   │   ├── traefik.yml
│   │   ├── k3s.yml               (fase 2)
│   │   └── observability.yml
│   ├── inventory/
│   │   └── hosts.yml
│   ├── roles/
│   │   ├── common/
│   │   ├── docker/
│   │   ├── traefik/
│   │   ├── k3s/
│   │   └── monitoring/
│   └── group_vars/
├── terraform/                    (OpenTofu)
│   ├── cloudflare/
│   ├── backups/                  (fase 2)
│   └── modules/
├── docker/                       (Compose + Dockerfiles base)
│   ├── docker-compose.staging.yml
│   ├── docker-compose.prod.yml
│   └── traefik/
└── k8s/                          (fase 2+)
    ├── charts/                   (Helm chart genérico)
    ├── apps/                     (values por serviço)
    └── argocd/                   (apps + app-of-apps)
```

**Estado do OpenTofu:**
- **Backend remoto** desde o início — Backblaze B2 ou S3 (com lock via DynamoDB-compatible) — para evitar state local
- Workspace por ambiente quando aplicável (Cloudflare normalmente é único)

**Conceitos a exercitar:**
- Imutabilidade declarativa (recriar VPS do zero seguindo o playbook)
- Drift detection (Ansible `--check`, `tofu plan`)
- Variáveis de ambiente, secrets em IaC (Ansible Vault, encrypted state)
- Modularização (roles Ansible, módulos OpenTofu)
- IaC review em PR (mudanças de infra passam por CI antes de aplicar)
- Separação clara: configuração de SO (Ansible) vs provisioning de recursos API-driven (OpenTofu)
- GitOps (Helm + ArgoCD na fase 2)

**Decisões adiadas:**
- Pulumi como alternativa em projeto futuro (não adotado aqui)
- Packer/cloud-init para imagens imutáveis — exercício avançado opcional
- Atlantis ou Spacelift para gerenciamento centralizado de Terraform — não necessário em projeto solo

### 5.6 Estratégia de deploy (rolling, blue/green, canary)
**Escolha:** Blue/Green + Canary em dois serviços diferentes, introduzido na Fase 2 (opção 4)

**Fase 1 (Compose na VPS) — Rolling update simples:**
- Default: `docker compose pull && docker compose up -d --no-deps <service>`
- **Healthcheck obrigatório** em cada serviço (`HEALTHCHECK` no Dockerfile + `healthcheck:` no Compose)
- `depends_on: condition: service_healthy` para ordem correta
- Rollback: redeploy da imagem da versão anterior (tag explícita) — script de rollback documentado

**Fase 2 (k3s) — Argo Rollouts em serviços selecionados:**
- **Argo Rollouts** instalado no cluster
- Default para todos os serviços: rolling update nativo do Kubernetes
- **`payment-service` com Blue/Green:**
  - Argo Rollouts `strategy.blueGreen`
  - `activeService` + `previewService` (rota preview pra smoke tests)
  - Smoke tests automáticos no preview antes do switch
  - Promote: manual via UI/CLI inicialmente; depois automatizado
  - Rollback = switch instantâneo de volta para "blue"
  - **Motivo:** rollback instantâneo é valor real em pagamentos
- **`catalog-service` com Canary:**
  - Argo Rollouts `strategy.canary` com steps `5% → 25% → 50% → 100%`
  - Pausas entre steps (5-10 min)
  - **AnalysisTemplate** consultando Prometheus — métricas RED:
    - Taxa de erro (5xx) abaixo de threshold
    - p95 de latência abaixo de threshold
  - Abort automático se métrica degrada
  - **Motivo:** alta leitura, exposição gradual valida com baixo blast radius

**Pré-requisitos da Fase 2:**
- Stack de observabilidade (Prometheus + Grafana) operacional
- Métricas RED expostas por todos os serviços via `/metrics`
- Smoke tests automatizados como conjunto reaproveitável (Postman/Newman, k6, ou scripts shell + curl)

**Conceitos a exercitar:**
- Healthchecks bem desenhados (não confundir liveness com readiness)
- Rolling update: `maxSurge`, `maxUnavailable`, readiness gates
- Argo Rollouts CRDs (`Rollout`, `AnalysisTemplate`, `Experiment`)
- Strategy `blueGreen` (preview, activeService, autoPromotion)
- Strategy `canary` (steps, pause, setWeight, analysis)
- Análise automática baseada em métricas Prometheus
- Promote, abort, rollback declarativos
- Trade-offs reais entre rolling, blue/green e canary — saber escolher por serviço

**Decisões adiadas:**
- Flagger (alternativa ao Argo Rollouts, mais opinativo) — não adotado; pode ser exercício comparativo futuro
- Canary com header-based / cookie-based routing (vs aleatório por peso) — exercício avançado
- Progressive delivery com feature flags (LaunchDarkly/Unleash) integrado ao Argo Rollouts — exercício futuro

### 5.7 Gestão de secrets
**Escolha:** Híbrido faseado (opção 7)

**Princípios em todas as fases:**
- Nunca commitar secret em texto plano
- Nunca logar secret
- **Pre-commit hook** com `gitleaks` (ou `trufflehog`) detectando secrets vazados
- Rotação documentada (mesmo manual no início)
- Secrets diferentes por ambiente (zero reuso staging ↔ prod)
- Princípio do menor privilégio: cada serviço só recebe o secret que precisa
- Auditoria: log de quando um secret foi acessado (no que a ferramenta suportar)

**Fase 1 (Compose na VPS):**
- **GitHub Secrets** organizados por **GitHub Environments**:
  - Environment `staging` — secrets de staging
  - Environment `production` — secrets de prod (com **required reviewers** = manual approval)
- **Ansible Vault** para secrets que vivem na VPS persistentes (ex.: senha admin do Traefik dashboard, credenciais de bootstrap)
  - Senha do vault armazenada em GitHub Secret (`ANSIBLE_VAULT_PASSWORD`)
- `.env` na VPS **gerado em deploy time** pelo workflow do GitHub Actions:
  - Workflow lê secrets do GitHub Environment correto
  - Substitui placeholders em `.env.template` versionado no repositório
  - SCP/SSH transfere o `.env` final para o servidor (ou injeta diretamente nos containers via `docker compose --env-file`)
  - **Nunca** commitar `.env` final
- Pre-commit local: `gitleaks` no husky pre-commit hook
- CI: `gitleaks` action rodando em todo PR (bloqueia merge se vazar segredo)

**Fase 2 (k3s):**
- **Sealed Secrets** (Bitnami) como primeira solução:
  - `kubeseal` criptografa secrets localmente com chave pública do controller no cluster
  - Versão criptografada commitada no Git
  - Controller decripta no cluster e cria `Secret` nativo do Kubernetes
  - Backup das chaves do controller é crítico (procedimento documentado)
- **Migração para External Secrets Operator (ESO) + cofre externo:**
  - Instalar ESO no cluster
  - Cofre: **Vault** em modo single-node na VPS (com **auto-unseal** via arquivo cifrado por chave em ambiente seguro) **ou** SaaS gratuito (Infisical / Doppler) — decisão final na fase
  - `ExternalSecret` declara "que secret quero, de qual cofre" → ESO cria/atualiza `Secret` nativo
  - Permite **rotação no cofre** sem redeploy
- Por enquanto, Sealed Secrets é o ponto de partida; ESO entra como evolução

**Fase 3 (futura):**
- Vault cluster real (HA) ou cofre cloud (AWS Secrets Manager / GCP Secret Manager)
- **Dynamic secrets** para bancos (Vault gera credenciais sob demanda, com TTL curto)
- **Rotação automatizada** integrada com aplicações
- Cert-manager + Vault PKI emitindo certificados internos

**Conceitos a exercitar:**
- Secret injection em diferentes camadas (CI, host, container, k8s Secret)
- GitHub Environments como gate de promoção
- Ansible Vault (encrypt/decrypt de arquivos sensíveis no Git)
- Detecção de vazamentos (gitleaks/trufflehog)
- Sealed Secrets e o modelo "secret cifrado no Git, controller decripta no cluster"
- External Secrets Operator e separação fonte ↔ consumo
- (Fase 3) dynamic secrets, rotação, leasing
- Hierarquia de privilégios e rotação de chaves

**Decisões adiadas:**
- Doppler/Infisical como solução principal — descartado em favor de aprendizado mais profundo (Vault/ESO); pode entrar como cofre externo do ESO se justificar
- HSM, KMS e PKI completo — não no escopo educacional inicial

---

## 6. Observabilidade & Qualidade

### 6.1 Stack de observabilidade
**Escolha:** Grafana LGTM + OpenTelemetry como padrão de instrumentação (opções 2 + 3)

**Stack:**
- **Métricas:** Prometheus (scrape) + Grafana (dashboards)
- **Logs:** Loki + Grafana
- **Traces:** Tempo + Grafana
- **Coleta unificada:** OpenTelemetry Collector (recebe OTLP de todos os serviços; exporta para Prometheus/Loki/Tempo)
- **Alerting:** Alertmanager (Prometheus rules) + Grafana Alerts (overlap consciente)
- **Visualização:** Grafana único com correlação logs ↔ traces ↔ métricas

**Instrumentação por linguagem:**
- **Java/Spring:** OpenTelemetry Java Agent (auto-instrumentation) + Micrometer para métricas custom de domínio
- **Node/NestJS:** OpenTelemetry SDK + autoinstrumentations (HTTP, gRPC, Prisma/TypeORM, Kafka, Redis)
- **Go:** OpenTelemetry SDK (instrumentação manual; boilerplate aceitável)
- **Padrão:** todo serviço expõe `/metrics` (Prometheus format) e envia traces + logs estruturados via OTLP

**Padrões a exercitar:**
- **RED metrics** (Rate, Errors, Duration) por endpoint público
- **USE metrics** (Utilization, Saturation, Errors) para recursos críticos
- **Logs estruturados em JSON** com campos `traceId`, `spanId`, `service`, `version`, `env` em todas as entradas
- **Trace context propagation** (W3C TraceContext) entre serviços HTTP **e através do Kafka** (propagator custom para headers de mensagem)
- **Sampling** de traces (ex.: 10% baseline + 100% para requisições com erro)
- **Service map** automático no Grafana derivado dos traces
- **SLI/SLO por serviço** (ex.: checkout p95 < 500ms; 99% disponibilidade do catalog)
- **Alertas** em Discord/Slack via Alertmanager quando SLO está em risco; runbook linkado

**Onde rodar a stack:**
- **Fase 1 (Compose):** containers da stack (Prometheus, Loki, Tempo, Grafana, OTel Collector) — rodando ao lado dos serviços; dashboards acessíveis via subdomínio admin com basic auth
- **Fase 2 (k3s):** `kube-prometheus-stack` via Helm + Loki/Tempo via Helm; Grafana com OAuth (Cloudflare Access ou similar)
- **Retention conservadora** (VPS Hostinger limitada):
  - Logs: 7 dias em Loki
  - Métricas: 15 dias em Prometheus
  - Traces: 3 dias em Tempo
- **Backup** dos dashboards e regras de alerta como código (`infra/observability/`)

**Configuração do OpenTelemetry Collector:**
- Pipeline `traces → tempo`
- Pipeline `metrics → prometheus`
- Pipeline `logs → loki`
- Processadores: batch, memory_limiter, attributes (enriquecimento com `service.name`, `service.version`, `deployment.environment`)
- Receivers: OTLP gRPC + HTTP

**Conceitos a exercitar:**
- Os "três pilares" e correlação entre eles (clicar no log → ver trace → ver métricas)
- Cardinalidade em métricas — uso disciplinado de labels
- Pull (Prometheus) vs Push (OTLP) e quando usar cada um
- PromQL, LogQL, TraceQL
- Dashboards profissionais: variáveis, links contextuais, anotações de deploy automáticas
- Alerting com runbooks linkados em cada alerta
- Black-box monitoring (Blackbox Exporter) para checagem externa de endpoints públicos
- Logs estruturados desde o dia 1 (nunca `console.log`/`println` solto)
- **Tracing através do Kafka** — desafio típico de event-driven; propagação manual de trace context em headers de mensagem

**Conceitos avançados (fase 2+):**
- Continuous profiling (Pyroscope / Grafana Pyroscope) — opcional
- eBPF-based observability (Pixie) — opcional
- Anomaly detection com Grafana ML — opcional
- Synthetic monitoring (k6, Grafana Synthetic) — exercício planejado

**Decisões adiadas:**
- SignOz / Datadog / New Relic como alternativas — não adotados; conhecimento de Prometheus/Grafana é universal
- Pyroscope (profiling contínuo) — exercício avançado opcional
- eBPF observability — exercício avançado opcional

### 6.2 Estratégia de testes
**Escolha:** Pirâmide moderna com contract tests (opção 2)

**Mix de testes por serviço:**

| Camada | Volume | Ferramentas | Onde roda |
|--------|--------|-------------|-----------|
| **Unit** | ~70-80% da suite | Java: JUnit 5 + Mockito + AssertJ; Node/TS: Vitest ou Jest + Supertest; Go: `testing` + `testify` | CI em todo PR |
| **Integration** | ~15-20% | Testcontainers (Java/Node/Go) com Postgres, Kafka, Redis reais; Spring Boot Test no mundo Java | CI em todo PR |
| **Contract (Pact)** | poucos mas críticos | Pact + Pact Broker (self-hosted) | CI em todo PR (consumer-driven; producer verifica) |
| **Schema compatibility** (eventos) | em todo PR que toca `.proto` | `buf breaking` | CI |
| **Component** | pular no início | — | — |
| **E2E** | 3-5 fluxos críticos | Playwright (UI+API) ou k6/Postman | apenas em staging, fora do CI principal |
| **Smoke (pós-deploy)** | obrigatório | scripts shell + curl ou Newman | Após cada deploy de staging/prod (gate de promoção) |
| **Performance** | janelas dedicadas | k6 (`tools/load-tests/`) | staging, ad hoc / antes de release crítico |
| **Chaos** | fase avançada (k8s) | Litmus ou Chaos Mesh | k3s (Fase 2+); game days documentados |

**E2E — fluxos alvo:**
1. Cadastro + login
2. Busca + adiciona ao carrinho
3. Checkout completo (estoque → pagamento → notificação)
4. Devolução de pedido
5. Wishlist (criar, adicionar, remover)

**Smoke tests pós-deploy (gate de canary/BG):**
- `/health` de cada serviço retorna 200
- Login com usuário de teste funciona
- `GET /products` retorna lista não vazia
- Criar pedido de teste e cancelar (sem cobrança real)

**Pact / Contract Tests:**
- Pact Broker self-hosted em container (acessível só interno em fase 1)
- Aplicar em integrações **REST inter-serviço** críticas (checkout consultando pricing/inventory/shipping)
- Eventos Kafka cobertos por `buf breaking` no schema compatibility check
- CI gate: PR bloqueado se quebrar contrato consumido sem coordenação

**Cobertura de código:**
- **Codecov** integrado ao PR (badge no README)
- Metas:
  - Serviços críticos (`order`, `payment`, `inventory`, `checkout`): **70-80%**
  - Demais serviços: **60%**
- Cobertura **não é o KPI principal** — qualidade do teste importa mais; PR com cobertura alta e teste fraco é pior que cobertura média com teste robusto

**Convenções de teste:**
- Nomenclatura clara: `should<Comportamento>When<Condição>` (Java) / `it('should ... when ...')` (Node)
- AAA pattern (Arrange / Act / Assert)
- Testcontainers preferido sobre mocks de banco (mais confiança, menos drift)
- Mocks apenas para fronteiras externas (gateway de pagamento, SMTP, etc)

**Conceitos a exercitar:**
- Pirâmide de testes em microsserviços
- **Testcontainers** como padrão de integração moderna
- **Consumer-Driven Contracts** (Pact) e ciclo producer/consumer
- Schema evolution + compatibility check no CI
- Smoke tests como gate de promoção (já casado com canary/BG)
- Performance testing com k6 e regressão de performance
- Chaos engineering com game days (fase 2+)
- Cobertura como métrica de saúde, não como objetivo final
- Test pyramid invertida quando faz sentido (testing trophy para serviços CRUD-ish)

**Decisões adiadas:**
- BDD com Cucumber/Gherkin — não adotado; pode entrar como exercício futuro em um serviço escolhido
- Mutation testing (Pitest, Stryker) — exercício avançado opcional
- Property-based testing (jqwik, fast-check) — exercício avançado opcional

### 6.3 Qualidade de código & DevSecOps
**Escolha:** Padrão de mercado moderno (opção 2)

**Camada A — Formatação (auto-fix):**
- Java: **Spotless** + Google Java Format
- Node/TS: **Prettier**
- Go: **gofmt** + **goimports**
- Markdown/YAML/JSON: **Prettier**

**Camada B — Linting:**
- Java: **Checkstyle** (Google style) + **SpotBugs**
- Node/TS: **ESLint** com `@typescript-eslint` + regras específicas para NestJS
- Go: **golangci-lint** com config compartilhado
- Markdown: **markdownlint**
- Dockerfile: **hadolint**
- Shell scripts: **shellcheck**

**Camada C — Análise estática:**
- **SonarCloud** (gratuito para repo público; analisa Java, TS e Go)
- **Quality Gate** bloqueia PR (thresholds: cobertura, code smells, bugs, vulnerabilities, duplicação)

**Camada D — SAST:**
- **Semgrep** com ruleset OWASP + regras customizadas
- Roda em todo PR

**Camada E — Detecção de secrets:**
- **gitleaks** em pre-commit (husky) **e** em CI (action dedicado em PR e push)

**Camada F — Dependências e licenças:**
- **Renovate** (auto-PRs para bumps em Maven, npm, Go, Docker, Helm, Terraform/OpenTofu)
- License Finder — opcional, fase posterior

**Camada G — Container scanning:**
- **Trivy** em todo build de imagem
- Bloqueia push de imagem com CVE HIGH/CRITICAL conhecida (com exceções controladas via `.trivyignore` justificadas)
- Cosign (assinatura) e Syft (SBOM) — adiados para fase DevSecOps

**Camada H — IaC scanning:**
- **Checkov** em `infra/` (Ansible, Terraform/OpenTofu, Helm)
- **kube-linter** em manifests/Helm na Fase 2+

**Orquestração local:**
- **husky** gerenciando hooks Git no monorepo Node
- Hooks ativos:
  - `pre-commit`: formatadores + linters + gitleaks no que está em stage (via lint-staged)
  - `commit-msg`: **commitlint** validando Conventional Commits com scope do serviço (já decidido)
- Pre-commit framework Python descartado em favor de simplicidade — só husky

**Workflows de CI consolidados (`.github/workflows/`):**
- `ci-lint.yml` — formatação + lint (matrix por linguagem)
- `ci-test.yml` — unit + integration (matrix por serviço)
- `ci-security.yml` — Semgrep + Trivy + gitleaks + Checkov
- `ci-quality.yml` — SonarCloud
- `ci-contracts.yml` — `buf breaking` + Pact provider verification
- `ci-build.yml` — build de imagens (só executa se os anteriores passarem)
- `release-please.yml` — gerencia PRs de release por serviço
- `cd-staging.yml` — deploy automático em staging após merge na `main`
- `cd-prod.yml` — deploy em prod após release publicado (com manual approval)

**Path filters em todos os workflows:** roda apenas para os serviços/áreas alteradas no PR.

**Conceitos a exercitar:**
- DevSecOps "shift-left" — segurança e qualidade detectadas em dev, não em prod
- Quality Gate como contrato automatizado
- Renovate (PR-based dependency management) com merge auto para patches
- Container security (Trivy) e a futura cadeia de SBOM/sigstore (cosign)
- IaC security (Checkov, kube-linter)
- pre-commit hooks consistentes entre local e CI (mesma regra, dois lugares)
- Custos de cada camada (CI minutes, falsos positivos, ruído) e como balancear

**Decisões adiadas:**
- Cosign (image signing) + Syft (SBOM) — exercício DevSecOps avançado
- Falco (runtime detection) em k8s — Fase 3
- Snyk — não adotado por sobreposição com Semgrep + Trivy
- License Finder / FOSSA — opcional em fase de consolidação

> **Nota de segurança (princípio 0.1):** dado o compromisso de pentest profissional, o pipeline de segurança será endurecido com varredura DAST (OWASP ZAP / Nuclei) em staging, image signing (cosign) e SBOM (Syft) **a partir da Fase 1**, não adiando para fase tardia. Os "decisões adiadas" acima continuam descritos como referência, mas Cosign/SBOM passam a ser obrigatórios no fluxo de build de imagem desde o início.

---

## 7. Segurança & Identidade

### 7.1 Identidade, autenticação e autorização
**Escolha:** Híbrido com Keycloak + serviços próprios (opção 5)

**Identidade do usuário e do staff (cliente final + admin):**
- **Keycloak** com 2 realms isolados:
  - `customers` — clientes do e-commerce (self-service registration, social login Google, opcional MFA)
  - `staff` — administradores e operadores (sem self-service; **MFA obrigatório**; sessões mais curtas)
- Themes customizados básicos (login com identidade visual da loja)
- Brute-force protection nativo do Keycloak habilitado em ambos realms
- **Account linking** controlado (evitar account takeover via social login)
- Conformidade com **OWASP ASVS V2 (Authentication)** como meta

**Identidade interna (serviço-a-serviço):**
- **Fase 1:** JWT propagado do gateway. Gateway valida via JWKS público do Keycloak; serviços internos re-validam o JWT (defense in depth, **nunca** confiar cegamente no gateway)
- **Fase 2:** **mTLS entre serviços** com certificados emitidos por **cert-manager + CA interna** (k8s) ou Vault PKI; SPIFFE/SPIRE como exercício avançado
- **Fase 3 (opcional):** service mesh (Linkerd) para mTLS automático

**Tokens e sessões:**
- **Access Token (JWT)** curto: **5 min** em `staff`; **15 min** em `customers`
- **Refresh Token** com rotação obrigatória; reuse detection ativo (invalida toda a árvore de tokens daquela sessão)
- **Algoritmo:** **RS256** (assinatura assimétrica) — nunca HS256, nunca `alg: none`
- Validações obrigatórias do JWT em cada serviço: `iss`, `aud`, `exp`, `nbf`, `iat`, assinatura via JWKS
- Cache de JWKS com refresh periódico (5 min) e fallback em caso de Keycloak fora do ar (com TTL bounded)
- **Logout efetivo:** revogação de refresh tokens no Keycloak; access tokens curtos para minimizar janela de uso indevido
- Possível **introspection endpoint** para tokens críticos (checkout, mudança de role) caso a janela de 5 min ainda seja muita

**Perfil de usuário (separação clara):**
- **Keycloak detém:** email, password hash, roles, social identities, MFA factors
- **`customer-service` detém:** dados de perfil estendidos (nome de exibição, endereços, preferências, wishlist) com `customer_id = sub` do JWT
- **`identity-service`** vira fino — atua como BFF para fluxos sensíveis (recovery, mudança de email/senha) mascarando detalhes do Keycloak quando útil

**Authorization (autorização):**
- **RBAC** inicial via roles do Keycloak: `customer`, `staff_admin`, `staff_support`, `staff_finance`
- Cada serviço valida claims em handlers/controllers; bibliotecas centralizadas com guards consistentes (Spring Security para Java; guards/decorators NestJS para Node; middleware Go)
- **OPA (Open Policy Agent)** introduzido em fase posterior para políticas declarativas mais ricas (ABAC) — exercício avançado
- **Authorization checks no código sempre próximos do dado** (não apenas no gateway) — defense in depth

**Endurecimentos específicos (pentest mindset):**
- Endpoints públicos com **rate limiting agressivo** em login, registro, recovery
- **Account enumeration prevention** — mensagens genéricas em "esqueci senha"; tempos de resposta uniformes
- **Password policy** — ASVS V2.1 (comprimento mínimo, validação contra leaks via API HIBP / lista local em fase posterior)
- **Cookies de sessão (se houver):** Secure, HttpOnly, SameSite=Lax/Strict
- **CSRF protection** onde se aplique (cookies); APIs JWT-only mitigam por design
- **CORS** restritivo, lista de origens explícita por ambiente
- **Headers de segurança** (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) configurados no gateway
- **Token theft mitigation:** refresh token rotation + IP/UA fingerprint opcional + audit log de "novo dispositivo"

**Auditoria:**
- Eventos de identidade auditados imutavelmente: login (sucesso/falha), mudança de senha, mudança de email, ativação/desativação de MFA, mudança de role, criação/exclusão de conta
- Trilha em tópico Kafka dedicado `audit.identity` (compactado/retido longo prazo) + persistência em banco append-only do `identity-service` ou serviço de auditoria dedicado (decisão futura)

**Capacity na VPS Hostinger:**
- Keycloak consome ~500 MB RAM — alocar limite explícito; usar perfil "production" otimizado
- **Avaliar consolidação:** uma única instância Keycloak servindo realms `staging` e `prod` separados? Reduz overhead mas reduz isolamento. **Decisão preferida:** 2 instâncias (uma por ambiente) se a VPS comportar; se não, uma única com realms separados, ciente do compromisso

**Conceitos a exercitar:**
- OAuth 2.0 (Authorization Code + PKCE) e OIDC
- JWT, JWS, JWKS, key rotation
- Refresh token rotation e reuse detection
- Realms, clients, mappers, scopes no Keycloak
- mTLS e PKI interna (Fase 2)
- RBAC vs ABAC (OPA em fase futura)
- Social login + identity federation segura
- Account takeover prevention
- ASVS V2 e OWASP ASVS framework

**Decisões adiadas:**
- WebAuthn / passkeys — exercício futuro (após base estável)
- SSO entre múltiplas aplicações — não há outra app
- Federação SAML — não no escopo
- Spring Authorization Server caseiro — descartado em favor de Keycloak

### 7.2 Defesa de borda (WAF, rate limiting, anti-bot, anti-fraude)
**Escolha:** Defense in depth real, faseada (opções 4 + 5 combinadas)

**Fase 1 — Cloudflare Free + Traefik endurecido + rate limiting na aplicação:**

**Cloudflare (camada externa):**
- DNS proxied (proxy laranja ativo)
- SSL/TLS modo **Full (Strict)** — sem fallback inseguro
- **Cloudflare Managed Rulesets** (free tier) ativos contra OWASP Top categorias
- **Bot Fight Mode** habilitado
- **Cloudflare Turnstile** (CAPTCHA invisível, free ilimitado) em:
  - `/auth/login`
  - `/auth/register`
  - `/auth/recovery`
  - `/checkout`
- **Rate limiting por IP** (free tier) em endpoints sensíveis (login, register, recovery, checkout)
- **Country block** opcional (audiência BR — bloquear países sem mercado para reduzir superfície)
- **Page Rules:**
  - Cache agressivo em rotas de catálogo público
  - No-cache em rotas autenticadas
- **mTLS Cloudflare → Traefik** (Authenticated Origin Pulls): apenas requisições assinadas pela Cloudflare entram na VPS

**Traefik (camada na VPS):**
- Plugin built-in `RateLimit` por endpoint
- Middleware injetando **headers de segurança**:
  - `Content-Security-Policy` (estrita, com nonce em fase posterior)
  - `Strict-Transport-Security` (HSTS com preload)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` restritivo (geolocation/camera/mic disabled)
  - `X-Frame-Options: DENY`
  - `Cross-Origin-*` policies (`Opener`, `Embedder`, `Resource`)
- **Coraza WAF plugin** para Traefik (defense in depth interno) — incluído já na Fase 1 dado o foco em segurança/pentest, mesmo que com tuning iterativo
- CORS restritivo (lista explícita de origens por ambiente)
- Logging estruturado com `CF-Connecting-IP`, `CF-IPCountry`, `CF-Ray` propagados

**Aplicação (camada de cada serviço):**
- **Rate limiting por usuário autenticado** em endpoints sensíveis:
  - Java: **Bucket4j**
  - Node/NestJS: **`@nestjs/throttler`** com storage Redis
  - Go: middleware customizado com Redis (token bucket)
- **Idempotency keys** obrigatórias em endpoints de mutação críticos:
  - `POST /checkout`
  - `POST /payments`
  - `POST /orders`
  - `POST /returns`
- **Validação de input** rigorosa em toda fronteira de serviço (não confiar no gateway):
  - Java: Bean Validation + sanitizers customizados
  - Node: class-validator + class-sanitizer
  - Go: validator + sanitização explícita

**Auditoria de borda:**
- Logs do Traefik enviados ao Loki
- Eventos Cloudflare (Logpush) opcionalmente para storage de longo prazo (B2/S3) — exercício avançado

**Fase 2 — Consolidação de defense in depth:**
- **Coraza WAF** com OWASP CRS tunado a partir de tráfego real (reduzir falsos positivos)
- **Cloudflare Pro** ($20/mês) avaliado se rate limiting avançado / Custom Rulesets justificarem
- **Anti-fraude transacional:**
  - Stripe Radar (ou equivalente) integrado ao gateway de pagamento
  - Regras adicionais simples no `payment-service`: velocity check (N pedidos/hora por IP/conta), BIN match com país de cobrança, geo-IP vs endereço de entrega
- **DAST automatizado:** OWASP ZAP (baseline scan) e Nuclei rodando em staging via GitHub Actions agendado (semanal) e ad-hoc por release crítica
- **Honeypots/deception**: rotas como `/admin`, `/wp-login.php`, `/.env` registram fingerprint do atacante e bloqueiam (decisão de implementação)

**Fase 3 — Avançada:**
- Bot management mais sofisticado (FingerprintJS Pro, análise comportamental)
- Cloudflare Workers para lógica de borda customizada
- WAF tuning iterativo baseado em relatórios de pentest profissional
- Threat Intelligence feeds integrados (CrowdSec, AbuseIPDB)

**Conceitos a exercitar:**
- Defense in depth real (CDN + WAF externo + WAF interno + rate limit aplicação)
- OWASP Top 10 (Web e API) mitigations
- Rate limiting strategies (token bucket, sliding window, distributed via Redis)
- mTLS Cloudflare ↔ origin (Authenticated Origin Pulls)
- Idempotency keys e proteção contra replay
- WAF tuning (regras vs falsos positivos) com OWASP CRS
- DAST como gate (ZAP/Nuclei em staging)
- Headers de segurança modernos (CSP, HSTS, COOP/COEP/CORP)
- CAPTCHA invisível (Turnstile) e impacto em UX
- Anti-fraude transacional (camadas: gateway, regras simples, ML futuro)
- Auditoria de tráfego suspeito e correlação com identidade
- Detecção de bypass de Cloudflare e mitigação

**Decisões adiadas:**
- Cloudflare Pro — começa em Free, migra se houver caso de uso concreto
- FingerprintJS Pro / Bot management pago avançado
- Cloudflare Workers (lógica de borda customizada)
- ML-based anti-fraude próprio
- WAF customizado em runtime via Semgrep ou regras dinâmicas

### 7.3 Compliance: PCI-DSS, LGPD e privacy by design
**Escolha:** Pacote A — Compliance pragmática profissional

**PCI-DSS — Estratégia SAQ A (terceirização total):**
- **Nunca** tocar PAN/CVV no sistema
- Gateway de pagamento (escolha em pergunta futura dedicada) hospeda checkout via iframe/SDK (Stripe Elements / Payment Element ou equivalente)
- `payment-service` armazena apenas:
  - Token opaco do gateway
  - Brand (Visa/Master/...)
  - Last4 do cartão
  - Expiry month/year
  - `customer_id`
- **Webhooks do gateway** com assinatura verificada criptograficamente (HMAC) para receber eventos de pagamento
- Sandbox em dev/staging; chaves de produção rotacionadas e em Vault
- Atestado SAQ A documentado em `docs/compliance/pci-saq-a.md`

**LGPD — Postura pragmática:**
- **Bases legais documentadas** por finalidade (execução de contrato, consentimento explícito, legítimo interesse)
- **ROPA** (Registro de Operações de Tratamento) versionado em `docs/compliance/lgpd-ropa.md`
- **Política de privacidade** versionada e exposta no rodapé do site
- **DPO nominal** documentado (você como responsável de contato)
- **RIPD** (Relatório de Impacto à Proteção de Dados) para fluxos críticos (recomendação, perfilamento)
- **Direitos do titular** implementados: acesso, retificação, exclusão (esquecimento), portabilidade, oposição
- `docs/compliance/lgpd-rights.md` documenta os fluxos

**Banner de consentimento e cookies:**
- 3 categorias granulares:
  - **Essenciais** (sempre on, sem opt-out)
  - **Performance** (analytics, opt-in)
  - **Marketing** (opt-in)
- Scripts não-essenciais bloqueados até consentimento (Cloudflare Zaraz ou solução leve in-house — decisão de implementação)
- **Registro de consent versionado** por usuário (timestamp, IP, escolhas, versão da política aceita)

**Tokenização e criptografia:**
- **TLS 1.3** obrigatório em todas as bordas
- **mTLS interno** na Fase 2 (já decidido)
- **Volume da VPS cifrado** (LUKS) — ou pgcrypto para colunas específicas se LUKS não disponível
- **ALE (Application-Level Encryption)** para campos especialmente sensíveis (CPF, telefone):
  - Chave em Vault, acessível apenas a `customer-service` e `identity-service`
  - Decryption só em runtime, nunca em logs/dumps
  - Mapeamento `service ↔ campo ↔ chave` documentado
- **Senhas:** bcrypt/Argon2 gerenciado pelo Keycloak (já decidido)
- **Cartão:** nunca armazenado (PCI SAQ A)

**Direito ao esquecimento (saga distribuída):**
- Endpoint autenticado `DELETE /me`
- `customer-service` emite evento `CustomerErasureRequested`
- Consumidores (todos os serviços com PII vinculada): anonimizam PII para o `customer_id`
- **Registros transacionais preservados** (pedidos/pagamentos) com PII anonimizada (CPF → hash one-way, nome → "Cliente removido", endereço → cidade/UF apenas) para cumprir obrigação fiscal (5 anos)
- Saga rastreia conclusão; emite `CustomerErased` quando todos confirmarem
- Audit log registra início e conclusão da exclusão
- Decisão técnica: usar **orquestrador** (`identity-service` ou serviço dedicado) ou **coreografia** com expectativa por reply — definir na implementação

**Logs e PII:**
- **Lib centralizada de logging** por linguagem com sanitização default destes campos:
  - `password`, `passwordHash`, `cpf`, `cnpj`, `cardNumber`, `cvv`, `cardExpiry`
  - `email` (pode ser sanitizado para `***@domain.com` por default)
  - `accessToken`, `refreshToken`, `idToken`, `apiKey`
  - `address`, `phone`
- Override explícito apenas em ambientes não-prod com flag específica
- **Audit logs** em tópico Kafka dedicado `audit.*`, persistidos em banco append-only, retenção longa (5+ anos para auditoria)
- **Loki não indexa PII** — busca por `traceId`, `userId` (pseudônimo), `serviceName`

**Documentação como artefato (no monorepo):**
```
docs/
├── SECURITY.md                 (política de divulgação + security.txt em /.well-known)
├── THREAT_MODEL.md             (STRIDE leve por contexto/serviço)
└── compliance/
    ├── lgpd-privacy-policy.md  (versão pública)
    ├── lgpd-ropa.md            (registro de tratamentos)
    ├── lgpd-rights.md          (fluxos de direitos do titular)
    ├── lgpd-ripd.md            (relatórios de impacto)
    ├── pci-saq-a.md            (atestado de escopo)
    ├── data-retention.md       (matriz de retenção por tipo de dado)
    ├── data-classification.md  (classificação: público / interno / confidencial / restrito)
    └── incident-response.md    (runbook de incidentes e notificação ANPD)
```

**Conceitos a exercitar:**
- PCI-SAQ A e redução de escopo (skill mainstream)
- LGPD aplicada — bases legais, ROPA, RIPD, direitos do titular
- ALE (Application-Level Encryption) com Vault e key management
- Saga de esquecimento (eventual consistency aplicada a privacy)
- Logging seguro e sanitização rigorosa
- Consent management e cookie compliance
- Webhooks assinados (verificação HMAC)
- Retenção e expurgo de dados (cron jobs ou eventos de domínio)
- Documentação de compliance como artefato versionado
- Diferença entre dados pessoais, sensíveis e anonimizados

**Decisões adiadas:**
- Tokenização própria (TSP) — descartada
- OneTrust e similares — não no escopo
- DLP avançado — exercício futuro
- k-anonimato em analytics e pseudonimização sofisticada — exercício avançado
- ANPD-ready DPIA completo (ferramenta com workflow) — só se justificar

### 7.4 Gateway de pagamento e estratégia de integração
**Escolha:** Dois gateways em paralelo via abstração (Stripe primeiro, Pagar.me depois) — opção 7 evoluindo para multi-gateway

**Fase 1 — Stripe como provider único:**
- Stripe sandbox em dev/staging (Stripe CLI para forward de webhooks ao localhost)
- **Stripe Elements / Payment Element** no frontend → garante **PCI SAQ A** (PAN/CVV nunca toca o sistema)
- **Stripe Radar** habilitado como camada anti-fraude integrada
- Cartões de teste documentados em `docs/payments/stripe-test-cards.md` (cenários: aprovação, recusa, fraude, 3DS, dispute)

**Abstração `PaymentProvider`:**
- Interface única exposta pelo `payment-service`:
  - `createPaymentIntent(orderId, amount, currency, metadata, idempotencyKey)`
  - `capture(intentId, amount?)`
  - `refund(paymentId, amount?, reason)`
  - `cancel(intentId)`
  - `verifyWebhook(payload, signature, timestamp) -> Event`
- Implementação `StripeProvider` na Fase 1
- `payment-service` nunca conversa direto com SDK do gateway — sempre via interface
- Fácil adicionar `PagarMeProvider` na Fase 2 sem refactor

**Fase 2 — Multi-gateway real (Pagar.me como segundo provider):**
- `PagarMeProvider` implementado (PIX e boleto nativos, cartão também)
- **Roteamento por contexto** (estratégia no `payment-service`):
  - PIX e boleto → Pagar.me
  - Cartão → escolha por BIN/contexto (default Stripe; Pagar.me se cliente brasileiro com cartão BR para reduzir taxa internacional)
  - **Fallback** automático: se Stripe falhar para cartão, tenta Pagar.me
- Roteamento configurável via tabela em banco (não hardcoded) para permitir A/B test entre providers
- MercadoPago descartado em favor de Pagar.me pelo DX superior (revisitável)

**Fase 3:**
- Reconciliação financeira automatizada (cron diário)
- Disputas/chargebacks com endpoint dedicado e fluxo de defesa
- Analytics de pagamento: taxa de aprovação por provider, tempo médio, distribuição de motivos de recusa
- Otimização de roteamento por dados (escolher provider que aprova mais para o BIN específico)

**Padrões implementados desde a Fase 1 (todos obrigatórios):**

| Padrão | Implementação |
|--------|---------------|
| **Idempotency keys** | Toda criação de PaymentIntent envia `Idempotency-Key`. Cliente envia idempotencyKey próprio que `payment-service` repassa ao gateway. |
| **Webhook signature** | HMAC verificado, timestamp com tolerância de 5 min para evitar replay |
| **IP allowlist** | IPs do gateway no Traefik + WAF Cloudflare (rule específica) |
| **State machine** | `pending` → `authorized` → `captured` → `refunded` (com `failed`, `disputed`, `cancelled` como ramificações). Transições registradas com timestamp e auditadas |
| **Retry com backoff** | Jitter + exponential backoff, max 3 tentativas, em chamadas síncronas ao gateway |
| **Circuit breaker** | Resilience4j em Java protegendo `payment-service` contra cascata se o gateway estiver instável |
| **Tokenização** | Apenas token + brand + last4 + expiry armazenados; PAN/CVV nunca |
| **Reconciliation job** | Cron noturno: pagamentos `pending` há mais de X horas → consulta gateway → atualiza estado, registra divergências |
| **Audit log imutável** | Toda transição de estado em tópico Kafka `audit.payments` + tabela append-only (event sourcing seletivo) |
| **Webhook idempotency** | `event_id` do gateway armazenado em tabela dedup; recebimento duplicado é no-op |
| **TLS pinning opcional** | TLS pinning para o endpoint do gateway em fase avançada |

**Configuração de chaves:**
- Sandbox keys em GitHub Secret de `staging`
- Live keys em GitHub Secret de `production` + Vault (Fase 2 com External Secrets)
- **Rotação documentada** em `docs/runbooks/rotate-payment-keys.md`
- Nunca commitar key

**Webhooks endurecidos:**
- Endpoint dedicado por provider (`/webhooks/stripe`, `/webhooks/pagarme`)
- Verificação de assinatura HMAC + timestamp como **primeira ação** antes de qualquer processamento
- IP allowlist do provider (Cloudflare e Traefik) — se vier de outro IP, 404 silencioso
- Rate limit específico para o endpoint
- Idempotência via `event_id` armazenado com TTL de 30 dias
- Body bruto preservado para verificação de assinatura (atenção a parsers que mutam o body)

**Conceitos a exercitar:**
- Integração com gateway externo (idempotência, webhooks, retries, state machine)
- Padrão **Adapter/Strategy** (`PaymentProvider` abstrato + implementações)
- **Multi-gateway** com fallback e roteamento por contexto
- Reconciliação financeira (cron + dedup + alertas de divergência)
- PCI-SAQ A na prática (iframe seguro do Stripe Elements)
- **Webhook security** (HMAC, timestamp, IP allowlist, idempotência, body raw)
- Disputas e chargebacks (Fase 3)
- Stripe Radar e camadas anti-fraude
- State machine bem desenhada (event sourcing seletivo)
- Auditoria imutável de transações financeiras

**Decisões adiadas:**
- Cielo/Rede/Getnet — descartados (DX inferior)
- MercadoPago — descartado em favor de Pagar.me (revisitável)
- Recorrência/assinaturas — fora do escopo do e-commerce de moda
- Split de pagamento — não é marketplace
- Multi-gateway com otimização ML por taxa de aprovação — exercício avançado

---

## 8. Frontend

### 8.1 Stack e arquitetura
**Escolha:** Híbrido — Next.js para storefront e Next.js + shadcn-admin para painel admin (opção 7 com stack consistente)

**Estrutura no monorepo:**
```
frontend/
├── web/              (Next.js — storefront público)
├── admin/            (Next.js — painel administrativo)
└── shared/           (componentes UI compartilhados, hooks, types)
```

**Storefront (`frontend/web`):**
- **Next.js 15+** com App Router
- **React 19+**, TypeScript estrito
- **Server Components** onde fizer sentido (busca de dados); **Client Components** para interatividade
- **Tailwind CSS** + **shadcn/ui** (Radix base — acessibilidade out of the box, componentes copiados ao projeto)
- **TanStack Query** + **openapi-fetch** com **tipos gerados do OpenAPI** (`openapi-typescript`) → tipos compartilhados com backend
- **Zustand** para estado client global pequeno (carrinho UI, preferências)
- **next-intl** para i18n (PT-BR principal; EN como exercício)
- **next-sitemap** + structured data (Schema.org Product/BreadcrumbList/Organization) para SEO

**Painel admin (`frontend/admin`):**
- Mesmo stack Next.js + shadcn (menos conceitos novos, Claude Code mais eficiente)
- Foco em produtividade: tabelas ricas, filtros, formulários complexos
- Acessível em subdomínio `admin.meuapp.com`, autenticado pelo realm `staff` do Keycloak
- MFA obrigatório (já decidido)

**Estratégia de renderização (storefront):**

| Página | Modo | Justificativa |
|--------|------|---------------|
| Home | ISR (revalidate por tempo) + seções dinâmicas via CSR | Performance + frescor |
| Listagem de categoria | ISR ou SSR | SEO + latência baixa |
| Página de produto | ISR (revalidação on-demand via webhook quando catalog muda) | SEO crítico + frescor |
| Resultados de busca | SSR | Resultado dinâmico por query |
| Carrinho | CSR | Interativo, autenticado |
| Checkout | CSR | Stripe Elements + interatividade |
| Conta do usuário | CSR | Autenticado, sem SEO |

**Segurança aplicada (pentest-aware) — frontend:**
- **CSP estrita com nonce dinâmico** por request em ambos os fronts (Next.js middleware injeta nonce em scripts inline)
- HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (já configurados no Traefik; reforçados no Next config)
- **SRI** (Subresource Integrity) em scripts e styles externos
- **DOMPurify** em todo conteúdo HTML user-generated (reviews, descrições de produto se houver editor rico)
- **Sem client-side secrets** — todas chamadas a APIs externas via BFF Go (gateway)
- Lockfile commitado; `npm ci` no CI (frozen install)
- **Renovate** atualizando deps de frontend com alta frequência (vetores de supply chain ativos)
- **Trivy / npm audit** em cada build de container do frontend
- **Tampering detection** opcional: hash conhecido do SDK do Stripe verificado em runtime
- **CORS restritivo** (lista explícita de origens por ambiente, validada no gateway)
- Auth via JWT em **Authorization header** (mitiga CSRF por design — sem cookies de sessão críticos)

**Estado e dados:**
- **TanStack Query** como camada padrão para fetch / cache / mutation / optimistic updates
- `openapi-fetch` cliente tipado (gerado do OpenAPI versionado em `contracts/openapi/`)
- Carrinho: estado local em Zustand + sync com `cart-service` via TanStack mutations (otimismo + reconciliação)
- Cache HTTP com tags de revalidação (`revalidateTag('product-{id}')`) acionado por webhook de domínio

**Testes de frontend:**
- **Unit:** Vitest + React Testing Library
- **Component:** Storybook (catálogo + interaction tests)
- **E2E:** Playwright (já alinhado com seção 6.2)
- **Accessibility:** **axe-core** integrado aos testes (a11y como gate, não opcional)
- **Visual regression:** Chromatic (Storybook) ou Playwright snapshots — Fase posterior

**Performance:**
- **Web Vitals** monitorados em produção (OTel browser SDK enviando ao Tempo/Prometheus)
- **Image optimization:** `next/image` + ImgProxy auto-hospedado no MinIO (alternativa: Cloudflare Images se justificar custo)
- **Bundle analyzer** rodando no CI; alerta se PR ultrapassar threshold de tamanho
- **Lighthouse CI** em PR como gate para regressão de performance (perf, a11y, SEO, best-practices)
- Code splitting nativo do App Router; dynamic imports para componentes pesados (editores, gráficos)

**Acessibilidade (a11y):**
- Meta: **WCAG 2.1 AA**
- Componentes shadcn/Radix são a11y por design — não retirar atributos `aria-*`
- Storybook com a11y addon
- Testes E2E executam axe em rotas críticas
- Skip links, foco visível, contraste validado, navegação 100% por teclado

**SEO técnico:**
- Sitemap automatizado (`next-sitemap`)
- robots.txt diferenciado por ambiente (staging bloqueia indexação)
- Open Graph + Twitter Cards em todas as páginas relevantes
- Schema.org JSON-LD: Product, BreadcrumbList, Organization, Review, AggregateRating
- Meta tags dinâmicas (geradas no Server Component)
- Canonical URLs

**Conceitos a exercitar:**
- App Router + Server Components (padrão moderno)
- ISR e revalidation strategies (time-based, tag-based, on-demand via webhook)
- Server Actions vs API routes vs BFF separado (BFF Go é o canal padrão; server actions só para mutações simples sem cross-service)
- TanStack Query patterns avançados (cache, mutation, optimistic update, invalidation)
- Tailwind + design system sobre Radix
- a11y aplicada
- Web Vitals + SEO técnico
- **CSP estrita com nonce** e impacto em DX
- Geração de types a partir do OpenAPI (contract-first com tipos compartilhados)
- Storybook como design system documentado
- Lighthouse CI como gate
- Renderização híbrida (ISR/SSR/CSR) e quando usar cada uma

**Decisões adiadas:**
- Headless CMS (Sanity, Strapi) para conteúdo editorial — Fase 3 se justificar
- PWA (Service Worker, offline) — exercício futuro
- Mobile app (React Native/Flutter) — fora do escopo
- Visual regression em CI — Fase posterior
- Microfrontends — overkill (storefront e admin são apps separadas, não microfrontends)
- Refine como alternativa ao admin custom — descartado em favor de stack consistente

---

## 9. Plano de Aprendizado Faseado

### 9.1 Filosofia
**Escolha:** Híbrido em camadas (opção 5) — Fundações DevOps mínimas → MVP vertical slice → expansão de features → DevOps avançado → segurança aprofundada → exercícios avançados opcionais

**Princípios:**
- Cada fase termina em um marco visível e desplegado
- Fase 0 entrega plataforma observável e desplegável antes de qualquer feature de negócio
- Releases independentes por serviço a partir do primeiro commit
- Documentação atualizada por fase em `docs/phases/`
- Sem prazo fixo: cada fase termina quando o marco é atingido
- Quando uma fase tiver custo cognitivo alto (ex.: Fase 3 com k3s), pode ser quebrada em sub-marcos

---

### Fase 0 — Bootstrap (~1-2 semanas)
**Objetivo:** plataforma observável, desplegável, com release automático, sem nenhuma feature de e-commerce ainda.

**Entregáveis:**
- Repositório monorepo estruturado (services/, contracts/, frontend/, infra/, tools/, docs/)
- `PROJECT_BRIEF.md` finalizado
- Conventional Commits + commitlint + husky configurados
- release-please configurado para um serviço dummy
- GitHub Actions CI básica (lint + test do dummy)
- `hello-service` (dummy em Java ou Node) deployado em staging e prod via Compose na Hostinger
- Cloudflare DNS proxied + Traefik com HTTPS automático
- Observabilidade básica rodando (Prometheus + Grafana + Loki + Tempo + OTel Collector)
- Ansible playbook bootstrap aplicado na VPS (Docker, firewall, SSH hardening, swap, fail2ban)
- `gitleaks` em pre-commit e CI
- Documentação de runbooks iniciais (`docs/runbooks/`)
- `SECURITY.md` + `security.txt` em `/.well-known/`

**Marco 0.1:** *"Hello world deployado em staging E prod, observável, com release automático."*

---

### Fase 1 — MVP vertical slice (~4-6 semanas)
**Objetivo:** fluxo fim-a-fim mínimo do e-commerce funcionando.

**Fluxo coberto:** cadastrar → logar → ver produto → adicionar ao carrinho → checkout (Stripe sandbox) → pedido criado → notificação por e-mail.

**Serviços implementados:**
- `identity-service` (com Keycloak realm `customers`)
- `customer-service`
- `catalog-service` (catálogo simples, sem busca rica ainda)
- `cart-service`
- `checkout-service` (orquestrador de saga)
- `order-service`
- `payment-service` (Stripe sandbox)
- `notification-service`
- `api-gateway` (Go BFF)

**Plataforma:**
- Kafka rodando, eventos de domínio fluindo
- Saga de checkout funcionando (estoque mock, pagamento, pedido, notificação)
- **Outbox pattern** implementado em pelo menos 1 serviço crítico
- Smoke tests pós-deploy automatizados
- CSP estrita, headers de segurança, Cloudflare Turnstile em login/registro/checkout

**Frontend:**
- Storefront (`frontend/web`) com home, listagem, página de produto, carrinho, checkout (Stripe Elements), "meus pedidos"

**Marco 1.0:** *"Cliente fictício compra produto fictício de ponta a ponta, em ambiente real, com release semântica e observabilidade completa."*

---

### Fase 2 — Expansão de features e robustez (~6-8 semanas)
**Objetivo:** completar o escopo da seção 1.4 (e-commerce completo).

**Novos serviços:**
- `inventory-service` (estoque real com reservas e timeout)
- `pricing-service` (cupons e promoções)
- `shipping-service` (cálculo via mock/Correios sandbox)
- `search-service` (Elasticsearch + consumer de eventos do catalog)
- `review-service`
- Wishlist incorporada no `customer-service`

**Frontend:**
- Painel admin (`frontend/admin`) — gestão de produtos, pedidos, estoque, cupons, reviews
- Realm `staff` no Keycloak com MFA obrigatório

**Qualidade & integração:**
- Pact contract tests entre serviços críticos
- Renovate ativo (auto-PRs)
- SonarCloud Quality Gate bloqueando PR
- DAST (OWASP ZAP) rodando semanalmente em staging
- Saga de devolução implementada

**Marco 2.0:** *"E-commerce completo no escopo da seção 1.4 do brief."*

---

### Fase 3 — DevOps avançado (~4-6 semanas)
**Objetivo:** migrar para k8s e exercitar padrões avançados de deploy.

**Migração:**
- Instalar k3s na VPS (single-node)
- Migração de Compose para k8s **serviço por serviço** (Strangler-style), começando pelos menos críticos
- Helm charts (chart genérico parametrizável + values por serviço)
- **ArgoCD** instalado e operando GitOps

**Secrets e segurança:**
- **Sealed Secrets** primeiro
- Migração progressiva para **External Secrets Operator + Vault**
- mTLS interno (cert-manager + CA interna)

**Estratégias de deploy:**
- **Argo Rollouts** instalado
- `payment-service` em **Blue/Green**
- `catalog-service` em **Canary** com análise Prometheus

**Operação:**
- HPA (autoscaling) básico em serviços com tráfego variável
- Backup e restore automatizado (cron + storage externo B2/S3)
- **Chaos game days** documentados (matar pod aleatório, latência artificial, partição de rede)

**Marco 3.0:** *"Sistema operando em k3s com GitOps, mTLS, blue/green e canary."*

---

### Fase 4 — Segurança aprofundada e pentest (~4-6 semanas)
**Objetivo:** endurecer e validar o sistema contra ataques reais.

**Documentação:**
- **Threat model** formal (STRIDE) por contexto/serviço em `docs/THREAT_MODEL.md`
- **ASVS Level 2** self-assessment completo (`docs/compliance/asvs-checklist.md`)

**Pentest interno (você + ferramentas):**
- OWASP ZAP (active scan)
- Nuclei (templates customizados)
- sqlmap em endpoints suspeitos
- Burp Suite Community para fluxos manuais críticos
- Checklist OWASP API Security Top 10
- Documentar findings em `docs/pentest/internal-findings-YYYY-MM-DD.md`
- Corrigir e re-testar

**Endurecimento:**
- **Image signing** (cosign) e **SBOM** (Syft) integrados ao build
- **Falco** no k3s (runtime detection)
- Containers rootless, read-only filesystem, drop ALL capabilities por default
- **PodSecurityStandards** restritivo
- NetworkPolicies estritas (default deny + allowlists)
- Rotação de secrets exercitada
- Backup restore exercitado em ambiente isolado

**Resposta a incidentes:**
- Runbooks documentados (`docs/runbooks/incidents/`)
- **Game day de incidente simulado** (vazamento de credencial, container comprometido, derrubada da VPS)

**Pentest profissional externo:**
- Se for parte do escopo final: contratar pentest profissional após pentest interno mitigado
- Findings reais incorporados em backlog

**Marco 4.0:** *"Sistema endurecido, threat model documentado, pentest profissional realizado e principais findings tratados."*

---

### Fase 5 — Refinamento e exercícios avançados (opcional)
**Objetivo:** catálogo de "katas" educacionais avançados, cada um virando uma release.

**Exercícios candidatos:**
- gRPC interno seletivo (substituir REST inter-serviço em pontos quentes)
- Service mesh (Linkerd) com mTLS automático
- Multi-gateway de pagamento (Pagar.me como segundo provider)
- `recommendation-service` simples (collaborative filtering ou ML básico)
- `analytics-service` consumindo histórico Kafka via **replay** (demonstra valor real do replay)
- Continuous profiling (Pyroscope)
- Multi-nó k3s (HA real) ou migração para cluster gerenciado
- WebAuthn / passkeys
- OPA para ABAC
- Headless CMS para conteúdo editorial
- BDD em um serviço escolhido
- Mutation testing
- Property-based testing
- Visual regression em CI

**Marco 5.x:** cada exercício é uma release standalone, cada um com seu próprio aprendizado documentado.

---

### Tempo estimado total
- **6-9 meses** dedicando ritmo consistente como dev solo + Claude Code
- Cadência depende do tempo semanal disponível
- Não há prazo fixo — cada fase termina quando o marco é atingido

### Documentação por fase
- `docs/phases/phase-0.md`, `phase-1.md`, ... — entregáveis, decisões tomadas, lições aprendidas
- ADRs (Architecture Decision Records) em `docs/adr/` para decisões críticas tomadas durante a execução

### Conceitos de gestão a exercitar
- Marcos visíveis e celebráveis
- Backlog em `docs/backlog/` (markdown simples ou GitHub Projects)
- Sem deadlines artificiais — foco em qualidade e aprendizado
- Pausas planejadas entre fases para revisão e ajuste do plano
- Reflexão escrita ao final de cada fase ("o que funcionou", "o que mudaria", "próximos riscos")

---

## 10. Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| v1.0 | 2026-04-29 | Brief consolidado a partir de entrevista estruturada (30 perguntas). Aprovado pelo proprietário. |

---

## 11. Próximos Passos (definidos)

Sequência acordada após a entrevista:
1. **Backlog da Fase 0** — quebrar entregáveis em tarefas ordenadas em `docs/backlog/phase-0.md`
2. **ADRs críticos** — criar `docs/adr/template.md` (padrão Michael Nygard) e os primeiros ~8-10 ADRs derivados deste brief
3. **Início da Fase 0** — bootstrap real do monorepo
4. **Threat model leve da Fase 1** — antes de iniciar a Fase 1, fazer STRIDE leve do MVP vertical slice

---

*Fim do documento.*
