# ADR-0010 — AWS como eixo deliberado de aprendizado, com matriz de decisão self-hosted vs AWS-native por fase

- **Status:** accepted
- **Data:** 2026-05-02
- **Decisores:** Allysson Christopher
- **Tags:** meta, processo, infra, learning-trade-off, cloud, aws

## Contexto

A **ADR-0008** (2026-05-01) migrou a plataforma de execução do projeto de
VPS Hostinger única para AWS EC2 efêmera, citando entre os motivos que
"skills AWS portáveis têm peso maior em currículo/portfolio do que
expertise em 'tunei VPS Hostinger'". A migração foi tratada como decisão
de **substrato** — a AWS resolve onde a stack roda, mas a stack continua
sendo a mesma do brief original (Postgres self-hosted, Kafka self-hosted,
Keycloak self-hosted, LGTM stack self-hosted, GHCR como registry, etc.).

Em 2026-05-02, durante o fechamento da P0-B4 e do `aws-specs.md`, o
usuário reformulou explicitamente a ambição:

> "Quero usar ao máximo os serviços da aws em nossa aplicação."

Essa mudança de framing é mais profunda do que parece. **AWS deixa de
ser substrato e passa a ser eixo de aprendizado deliberado**, ao lado
de microsserviços (brief §2), segurança (§0.1), DevOps avançado (§5,
§9 Fase 3), observability (§6.1), DevSecOps (§6.3) e os outros eixos
cross-cutting já estabelecidos. O brief atual não reflete essa decisão —
todas as escolhas de componente foram tomadas em modo "self-hosted é
mais didático" porque essa era a tese de fundo no momento da escrita.

Forças em jogo:

- **Lock-in vs portabilidade.** Quanto mais AWS-native, mais valor
  específico AWS no portfolio (skills procuradas: RDS, Cognito, X-Ray,
  IAM, VPC), menos portabilidade pra outras clouds (GCP, Azure, on-prem),
  e mais fricção se o projeto virar "rodar em qualquer lugar" no futuro.
- **Aprendizado de conceito vs aprendizado de provider.** Operar Postgres
  cru ensina conceitos de DB (vacuum, WAL, replicação, capacity planning)
  que `aws rds create-db-instance` esconde. RDS ensina o managed-DB layer
  (automated backups, multi-AZ failover, Performance Insights, parameter
  groups) que self-hosted ignora. **Os dois são valiosos.**
- **Custo.** AWS-native tem custo recorrente em quase todos os
  componentes (RDS db.t3.micro mais barato ~$13/mês, ElastiCache cache.t3.micro
  ~$13/mês, EKS control plane $73/mês fixo, MSK ~$130/mês mínimo). O
  Budget atual é $30/mês; "AWS-ify everything" estoura sozinho.
- **Tempo / cognitive load.** Cada componente tem aprendizado próprio.
  Tentar fazer tudo AWS-native simultaneamente dilui o aprendizado de
  cada um. Faseamento ajuda.
- **Reversibilidade.** Migrar self-hosted → AWS-native é exercício
  conhecido (snapshot + restore, dump + import, dual-write + cutover).
  É exatamente o conteúdo de "DevOps avançado" da Fase 3 do brief.

A pergunta de design que emergiu: **como tornar "AWS é eixo deliberado"
um princípio aplicável sem virar "AWS-native default em tudo desde o
primeiro commit"?**

A resposta proposta — e adotada por esta ADR — é tratar o gap
self-hosted ↔ AWS-native como **camada de aprendizado adicional**, não
como substituição. Phase 1 entrega self-hosted (aprende o conceito puro),
Phase 2 reescreve componentes selecionados com AWS-native (aprende o
managed equivalente + a operação de migração).

## Decisão

**AWS é declarado eixo cross-cutting de aprendizado deste projeto, peer
da segurança e dos demais princípios do `PROJECT_BRIEF.md` §0.
Componentes self-hosted entregues na Phase 1 ganham, na Phase 2, uma
revisão deliberada: para cada um, decide-se entre (i) manter
self-hosted, (ii) migrar pra equivalente AWS-native via ADR específica,
ou (iii) coexistir os dois enquanto o conteúdo didático justificar.**

Detalhes da decisão:

### 1. Phase 1 self-hosted, Phase 2 AWS-native (regra default)

A regra default é simples:

- **Phase 1 (MVP vertical slice, ~4-6 semanas)** — entrega componentes
  no formato self-hosted/CNCF-padrão definido no brief original. Razão:
  o aprendizado de conceito puro é mais rico, custos são menores,
  experiência é portátil pra qualquer cloud.
- **Phase 2 (Robustez e DevOps avançado, ~6-8 semanas)** — para cada
  componente listado na **§2 Tabela de pareamento** desta ADR como
  candidato à migração, abre-se uma ADR específica com 3 saídas
  possíveis: **Migrar**, **Manter**, ou **Caso a caso**. A migração,
  quando aprovada, vira tarefa de Phase 2 com seu próprio runbook de
  cutover.

### 2. Tabela de pareamento self-hosted vs AWS-native

| Componente                         | Phase 1 (self-hosted)             | Phase 2 candidate AWS-native          | Decisão default | Mini-justificativa                                                                                                                                                                                                   | Critério de "não migrar"                                                                                                            |
| ---------------------------------- | --------------------------------- | ------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Container registry**             | GHCR                              | ECR                                   | **Manter**      | GHCR já entregue (P0-B3); imagens públicas alinhadas com repo público; ECR não traz aprendizado proporcional ao trabalho de migração + custo                                                                         | n/a — manter é default                                                                                                              |
| **DNS + CDN + WAF de borda**       | Cloudflare (free tier)            | Route 53 + CloudFront + AWS WAF       | **Manter**      | Cloudflare já entrega DNS + CDN + WAF Managed Rules + Bot Fight + AOP em um stack coerente; Route 53 isolado é só Hosted Zone — comparar valor exige stack inteiro AWS, custo desproporcional                        | Manter como caso de uso de provider terceiro **deliberadamente diferente** da AWS — exercita o multi-vendor real do mercado         |
| **Banco relacional**               | Postgres self-hosted (Compose)    | RDS Postgres                          | **Migrar**      | RDS adiciona automated backups com PITR, multi-AZ failover, Performance Insights, parameter groups gerenciados — conceitos managed-DB que não aparecem ao operar Postgres cru                                        | Workload exige extension não-suportada por RDS (raro), ou requer acesso a `pg_hba.conf` direto                                      |
| **Cache em memória**               | Redis self-hosted (Compose)       | ElastiCache Redis                     | **Migrar**      | ElastiCache adiciona automatic failover, in-place version upgrade, parameter groups e CloudWatch metrics nativos — operação managed que self-hosted obriga a aprender ad-hoc                                         | Custo do menor cache.t3.micro (~$13/mês) virar bloqueio em conta solo                                                               |
| **Broker de eventos**              | Kafka self-hosted KRaft           | MSK / MSK Serverless / SQS            | **Caso a caso** | Kafka self-hosted é didaticamente mais rico (broker, partitioning, ISR, consumer groups, exactly-once); MSK preserva Kafka mas managed; SQS é modelo diferente (queue vs log) — escolha depende do padrão de eventos | Exercício de pipelines event-sourcing-heavy é o conteúdo central de Phase 2 → manter Kafka self-hosted faz sentido                  |
| **Identidade (IdP)**               | Keycloak self-hosted              | Cognito                               | **Caso a caso** | Keycloak entrega RBAC/ABAC, federação SAML/OIDC, customização de tema, free; Cognito é AWS-native e barato em volume baixo, mas tem limitações em B2C de moda (custom flows, branding)                               | Custo Keycloak Operacional (RAM ≥ 1 GiB, JVM) virar fricção real, OU Cognito features bastarem ao caso real                         |
| **Secrets**                        | Ansible Vault + GitHub Secrets    | Parameter Store / Secrets Manager     | **Migrar**      | Parameter Store é IAM puro + free para níveis Standard; Secrets Manager adiciona rotation automática (RDS, etc) — exercício direto de IAM granular + KMS                                                             | n/a — caminho está fortemente alinhado com brief §0.1 (least privilege)                                                             |
| **Métricas (observability)**       | Prometheus                        | CloudWatch Metrics                    | **Caso a caso** | Prometheus é Kubernetes-native e free para custom metrics; CloudWatch cobra $0.30/metric/mês acima de free tier — bom pra serviços managed (RDS, ALB), ruim pra cardinality alta de app metrics                      | Cardinality de métricas custom > 100 por serviço → CloudWatch fica caro; manter Prom como agregador app, CW só pra managed services |
| **Logs (observability)**           | Loki                              | CloudWatch Logs                       | **Caso a caso** | Loki barato em retention longa via storage cheap (S3-compat); CW Logs cobra ingest ($0.50/GB) + storage — escala com volume                                                                                          | Volume de logs > 10 GB/dia → CW Logs estoura Budget; manter Loki                                                                    |
| **Traces (observability)**         | Tempo                             | X-Ray                                 | **Migrar**      | X-Ray integra nativamente com Lambda, API Gateway, ALB, RDS — se Phase 2 traz qualquer um desses, X-Ray cola sem effort; preço justo (1M traces/mês free)                                                            | Phase 2 não traz nenhum AWS-native que se beneficie de X-Ray → manter Tempo                                                         |
| **Reverse proxy / ingress**        | Traefik (Compose; ingress no k3s) | ALB / API Gateway                     | **Caso a caso** | Traefik é CNCF padrão portfolio, multi-cloud; ALB+API Gateway é AWS-specific mas didático pra serverless + WebSocket + Lambda integration                                                                            | Stack permanece container-only (sem Lambda/API Gateway routes) → manter Traefik                                                     |
| **Compute Phase 2 (orquestração)** | k3s self-hosted single-node       | EKS / ECS Fargate                     | **Caso a caso** | k3s ensina Kubernetes puro grátis; EKS control plane custa $73/mês fixo (estoura Budget); Fargate cabe pra workloads pontuais (jobs, cron) sem cluster fixo                                                          | Budget ≤ $30 → EKS é proibido por preço; manter k3s. Fargate só se entrar caso de uso de **job assíncrono** específico              |
| **CD pipeline**                    | GitHub Actions                    | CodePipeline + CodeBuild + CodeDeploy | **Manter**      | GHA já entrega o que precisamos com path filters, OIDC pra AWS, runners free; Code\* services são bem AWS-specific (lock-in alto) e não trazem skill universal proporcional                                          | n/a — manter é default                                                                                                              |
| **Code scanning (SAST)**           | CodeQL (já em ADR-0007)           | CodeGuru Reviewer                     | **Manter**      | CodeQL é gratuito, multi-language, integrado ao GitHub; CodeGuru é JVM-mostly e pago — substitution não traz valor                                                                                                   | n/a — manter é default                                                                                                              |
| **Dependency scanning**            | Renovate (planejado P0-H4)        | (não há equivalente AWS)              | **Manter**      | n/a — não há AWS-native equivalente comparável                                                                                                                                                                       | n/a                                                                                                                                 |
| **Email (notification-service)**   | SMTP terceiro (Mailgun/SES?)      | SES (Simple Email Service)            | **Migrar**      | SES é o caminho default AWS pra transacional; preço fica em centavos por 1k emails; integra com IAM e CloudTrail                                                                                                     | n/a — caminho natural quando notification-service entrar                                                                            |

**Componentes não pareados** (já são AWS-native ou não têm equivalente):
EC2, EBS, EIP, Security Group, IAM Identity Center, AWS Budgets,
CloudTrail (default ON), VPC. Esses ficam fora da tabela porque
**não há decisão a tomar** — já são AWS desde a ADR-0008.

### 3. Aplicação prática

- **Não muda nada do que já está implementado** (P0-A\*, P0-B\*) ou
  decidido (ADRs 0000–0009).
- **Não muda planos da Phase 1.** Cada componente self-hosted
  da tabela continua sendo o caminho de Phase 1 — Postgres em Compose
  na Fase 1, Kafka self-hosted na Fase 1, Keycloak self-hosted na Fase
  1, etc.
- **Define gancho explícito pra Phase 2.** Cada linha **Migrar** ou
  **Caso a caso** vira candidata a ADR específica no início da Fase 2.
  Linhas **Manter** ficam congeladas até nova evidência (regressão de
  custo, mudança de requisito, etc).
- **Cria backlog imediato pequeno** (P0-B5, P0-B6 — adicionados nesta
  PR ao backlog Fase 0): pra dar materialidade à decisão sem esperar
  Phase 2. CloudTrail organization trail + AWS Config baseline é caro
  ~zero e ensina audit/compliance AWS; escopar permission set IAM tira
  o `AdministratorAccess` broad (resolve follow-up #5 do `aws-specs.md`).
- **Em decisões cloud-relacionadas futuras**, sempre apresentar a
  variante AWS-native como alternativa explícita — mesmo que a decisão
  acabe sendo "manter self-hosted". O padrão "decisão registrada com
  alternativa rejeitada" é a regra do CLAUDE.md (§"Commit messages",
  §"ADRs"); esta ADR só formaliza que **AWS-native sempre entra como
  alternativa considerada** em qualquer escolha cloud-relacionada.

### 4. Critérios reutilizáveis pra decidir Migrar / Manter / Caso a caso

Em cada componente novo (que aparecer fora desta tabela), aplicar a
seguinte ordem de critérios:

1. **Custo cabe no Budget atual ($30/mês)?** Se não cabe sem
   reavaliação, default é Manter.
2. **AWS-native adiciona conceito didático que self-hosted não dá?**
   Se sim, default vira Migrar.
3. **Migração é unidirecional (lock-in alto)?** Se sim, exigir 1+
   alternativa real testada antes de Migrar (ex.: dual-write durante
   janela).
4. **Existe valor multi-vendor de manter o terceiro?** (Cloudflare é
   o exemplo: manter como caso real de provider terceiro deliberado).
   Se sim, Manter.
5. **Decisão fica em "dúvida real"?** Default vira Caso a caso, e o
   timing fica pra Phase 2 com mais material.

### 5. Itens fora do escopo desta ADR

- Decisões específicas de cada migração de Phase 2 — cada uma terá
  sua própria ADR (ADR-0011+).
- Multi-region / multi-account / disaster recovery — adiados pra
  Phase 3+ se justificar.
- Custo real consolidado da Phase 2 — só pode ser estimado quando
  cada migração específica nascer.

## Consequências

**Positivas:**

- **Aprendizado dobrado em conceitos chave** — termina o projeto
  sabendo Postgres puro **e** RDS, Redis puro **e** ElastiCache, Tempo
  **e** X-Ray, Vault **e** Secrets Manager. Cada par é skill
  cumulativo, não substituto.
- **Operação de migração vira conteúdo didático** — Phase 2 inclui
  cutovers reais (snapshot+restore, dump+import, dual-write) que são
  o material central de "DevOps avançado" do brief §9 Fase 3.
- **Decisões futuras ganham framework** — todo PR cloud-relacionado
  daqui pra frente sabe onde olhar (esta tabela) e tem critério de
  decisão padrão (5 critérios da §4).
- **Defesa contra "AWS-ify everything"** — a tabela diz explicitamente
  o que **não** vamos migrar (GHCR, Cloudflare, k3s, GHA, CodeQL),
  protegendo o aprendizado multi-vendor e o Budget.
- **Defesa contra "self-hosted everywhere"** — formaliza que o instinto
  default do brief original (self-hosted é mais didático) tem limite, e
  a Phase 2 traz o managed-equivalent como conteúdo deliberado.

**Negativas / trade-offs aceitos:**

- **Phase 2 fica densa** — o brief original previa "Robustez e DevOps
  avançado" como ~6-8 semanas; com migrações AWS-native específicas
  somando, pode escalar pra 8-12 semanas. Trade-off conscientemente
  aceito porque o conteúdo é exatamente o que se quer aprender.
- **Custo recorrente cresce na Phase 2** — RDS + ElastiCache + X-Ray
  - Secrets Manager somam ~$30-40/mês juntos no menor tier. Phase 2
    vai exigir ramp do Budget pra ~$60-80/mês ou turnar componentes off
    fora de janelas de uso (ephemeral pattern já adotado pra EC2). ADR
    específica vai documentar a escolha quando o tempo chegar.
- **Decisão fica "em aberto" em 4 componentes (Caso a caso)** — Kafka,
  Keycloak, observability métricas/logs, ingress, k3s. Fragiliza um
  pouco o planejamento de Phase 2 mas é honesto: a evidência só vem
  com workload real.
- **Brief precisa de adendos** — §0, §5.4, §5.7, §6.1, §7.1, §7.4
  ganham ponteiros pra esta ADR. Não é rewrite, mas é trabalho
  recorrente sempre que uma seção do brief for revisitada.
- **Não cria backlog Phase 2 ainda** — esta ADR só lista candidatos;
  o `docs/backlog/phase-2.md` (a criar) vai consumir a tabela e abrir
  uma tarefa por linha **Migrar** + **Caso a caso**. Risco: se a ADR
  ficar isolada e o backlog Phase 2 nunca nascer, vira folclore.
  Mitigação: P0-I4 (reflexão de fim de fase) deve disparar a criação
  do `phase-2.md`.

**Neutras / a observar:**

- **Tabela vai envelhecer** — preços AWS mudam, novos serviços nascem
  (ex.: Aurora Serverless v2 quase substitui RDS, MSK Serverless vira
  competitivo). Política: revisar a tabela no início de Phase 2 antes
  de abrir as ADRs específicas; se mudar muito, ADR-0010 vira
  superseded por nova ADR.
- **Nenhuma migração é forçada** — uma linha **Migrar** pode virar
  **Manter** na ADR específica de Phase 2 se evidência justificar.
  Esta ADR é o framework; a decisão real é da ADR específica.

## Alternativas consideradas

- **A. Status quo (esta ADR não nasce)** — descartada. Brief +
  ADR-0008 não declaram AWS como eixo deliberado; instinto default
  fica "self-hosted é mais didático" e cada nova decisão vira debate
  ad-hoc. Aprendizado AWS-native fica relegado a "se sobrar tempo".
- **B. Migrar tudo pra AWS-native default desde Phase 1** — descartada.
  Custo (Budget de $30/mês explode), tempo (cognitive load
  multiplicado), e aprendizado de **conceito puro** (Postgres cru,
  Kafka cru) some. Self-hosted Phase 1 é precondição pra apreciar o
  managed-equivalent depois.
- **C. Migrar uma sub-lista mínima (só Postgres → RDS)** — descartada
  como under-commit. Se a ambição é "exercitar AWS ao máximo", uma
  migração não responde. Tabela ampla cobre o espectro de skills
  procurado em portfolio.
- **D. Migrar tudo de uma vez no início de Phase 2** — descartada
  como over-commit. Phase 2 vira maratona de migrações simultâneas;
  cada uma compete por atenção. ADR específica por componente, em
  sequência, é o padrão Strangler que o brief §5.4 já adota pra k3s.
- **E. ADR sem tabela (só princípio "AWS é eixo")** — descartada como
  abstração. Princípio sem tabela vira frase decorativa; matriz
  concreta força a decisão de cada componente sair da generalidade.
- **F. Tabela enxuta (sem mini-justificativa, sem critério "não migrar")** — descartada.
  Tabela enxuta vira paráfrase do brief — perde o ponto da ADR (registro
  do **porquê** de cada pareamento). Critério "não migrar" é a única peça
  que protege o aprendizado multi-vendor (Cloudflare, GHA, GHCR, CodeQL).

## Referências

- `PROJECT_BRIEF.md` §0 (princípios cross-cutting — onde "AWS é eixo
  deliberado" se encaixa como peer de §0.1 segurança), §5.4 (caminho
  de execução — adendado em ADR-0008, agora ganha ponteiro pra esta
  ADR), §5.7 (gestão de secrets — futuro Secrets Manager), §6.1
  (observability — futuro CloudWatch / X-Ray), §7.1 (identidade —
  futuro Cognito caso a caso), §7.4 (gateway de pagamento — fora do
  escopo desta ADR mas SES como notification cabe quando notification-service entrar)
- ADR-0008 (pivot Hostinger → AWS EC2 — base sobre a qual esta ADR
  declara AWS como eixo deliberado, não só substrato)
- ADR-0009 (SSH → SSM — exemplo concreto de "AWS-native sempre entra
  como alternativa considerada")
- ADR-0006 (repo público — motiva GHCR público, alinha com decisão
  "Manter" do registry)
- ADR-0007 (CodeQL SAST — alinha com decisão "Manter" de code scanning)
- `docs/backlog/phase-0.md` P0-B5, P0-B6 (tarefas AWS-native imediatas
  introduzidas por esta ADR)
- `docs/infra/aws-specs.md` (estado atual da plataforma + follow-ups
  cuja resolução vira parte do exercício IAM granular)
- AWS docs:
  - [Well-Architected Framework — Operational Excellence](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/welcome.html)
  - [AWS Pricing Calculator](https://calculator.aws/) (estimativas de custo Phase 2)
- [12 Factor App](https://12factor.net/) (princípios que sobrevivem à escolha self-hosted vs managed)
