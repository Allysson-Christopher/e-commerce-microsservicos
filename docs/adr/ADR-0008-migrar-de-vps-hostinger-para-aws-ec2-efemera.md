# ADR-0008 — Migrar de VPS Hostinger única para AWS EC2 efêmera em `us-east-1`

- **Status:** accepted
- **Data:** 2026-05-01
- **Decisores:** Allysson Christopher
- **Tags:** infra, ci-cd, security, devops, cost, learning-trade-off

## Contexto

`PROJECT_BRIEF.md` §5.4 (versão de planejamento) escolheu **VPS Hostinger
única hospedando staging+prod simultaneamente** como caminho de execução —
recomendação A do brief, com isolação via Docker networks, Traefik
compartilhado e backups externos.

Durante a execução de **P0-B2** em 2026-05-01, antes de criar a zona DNS no
Cloudflare, o usuário comunicou que havia provisionado uma instância EC2
(`i-072708190abd3d102`, `t3.micro`, AL2023, `us-east-1b`) na AWS e propôs
migrar a plataforma de execução do projeto pra lá. Justificativa inicial
declarada: **"flexibilidade pra subir, escalar e excluir instâncias para
nossos testes"**.

A discussão de design que se seguiu reformulou a pergunta — "switch ou não"
não captura o trade-off real. O que estava em jogo:

**Ganhos não-óbvios da AWS** (não citados pelo usuário inicialmente):

- Skills AWS (IAM, VPC, Security Groups, OIDC, Route 53, EBS, CloudWatch,
  IAM Identity Center, SSM) têm peso maior em currículo/portfolio do que
  expertise em "tunei VPS Hostinger";
- IaC (OpenTofu) fica drasticamente mais rica — Hostinger só dava IaC do
  Cloudflare; AWS habilita VPCs, subnets, IAM roles/policies, Security
  Groups, EBS volumes, snapshots, ALBs;
- Fase 2 do brief (k3s multi-nó) vira `tofu apply -var instance_count=2`
  em vez de "comprar outra VPS";
- Snapshots EBS + AMIs habilitam exercícios não-disponíveis em VPS:
  golden image, chaos engineering, recriação do zero em minutos;
- IAM Roles for EC2 + IMDS eliminam credenciais long-lived no sistema
  (alinhado com brief §0.1 — pentest mindset);
- CloudTrail oferece auditoria centralizada gratuita.

**Armadilhas reais da AWS** (que precisam entrar de olhos abertos):

- **Free tier é faixa estreita**: 750h/mês de **uma** `t2.micro` (1 vCPU,
  1 GiB RAM, sem swap), 30 GiB EBS gp2, 100 GB outbound/mês — durante 12
  meses após criação da conta. A "flexibilidade pra subir várias instâncias
  pra testar" é exatamente o que estoura o free tier;
- **916 MiB de RAM em `t3.micro` não cabe a stack Fase 0** confortavelmente
  — confirmado por inspect direto: Java hello-service + Traefik + LGTM
  stack (Prometheus + Loki + Tempo + Grafana + OTel Collector) excede 1
  GiB. Para caber confortavelmente: `t3.small` (2 GiB, ~$15/mês fora do
  free) ou `t3a.medium` (~$25/mês). Brief §5.4 já avisava "RAM limitada"
  como restrição didática — AWS não resolve, só troca o limite;
- **Surface area AWS é vasta** — IAM "Access Denied" misterioso, NACL vs
  Security Group, NAT Gateway custando $32/mês esquecido, EBS volumes
  órfãos pós-terminate. Cada caso é didático, mas é muito material novo
  simultâneo com microsserviços + CI/CD + observability + segurança;
- **Esquecimento custa dinheiro** — a "facilidade de excluir" depende do
  dev lembrar de excluir;
- **Latência Brasil → `us-east-1`** ≈ 140 ms ida. Aceitável para
  desenvolvimento e simulação; chato para "prod real" — o brief assumia
  POP no Brasil via Hostinger.

**Conta AWS contexto:** já não é free tier (passou dos 12 meses ou tipo
não-elegível). Usuário aceitou explicitamente o gasto, com a restrição de
**modelo ephemeral** ("subir quando estamos desenvolvendo, terminate
quando não precisar — depois pensaremos em operacionalizar"). O **objetivo
do projeto é educacional** — não vamos rodar produção real, vamos simular
o mais real possível dentro desse escopo.

Caminhos de design avaliados (ver "Alternativas consideradas"): **A**
switch total para AWS EC2; **B** Hostinger como "prod-shaped" + EC2 como
sandbox de exercícios elásticos; **C** manter Hostinger.

## Decisão

**Migramos a plataforma de execução do projeto de VPS Hostinger única para
AWS EC2 efêmera em `us-east-1`, sob conta única (não multi-account),
seguindo modelo "spin-up para desenvolver / terminate quando não precisar"
com simulação de realismo de produção mas sem rodar produção real.**

Detalhes da decisão:

- **Região:** `us-east-1` (Northern Virginia). Escolhida porque a EC2
  inicial já foi provisionada lá e Identity Center foi habilitado nessa
  região (home region — não pode ser mudada sem deletar/recriar). `sa-east-1`
  (São Paulo) fica como **opção futura** se latência virar problema
  concreto — custo ~25% maior compensa pela proximidade BR.

- **Conta AWS:** única, não multi-account / Organizations. Solo dev em
  escopo educacional não justifica complexidade de account separation hoje.
  Quando o projeto evoluir (ou se for fork pra contexto profissional),
  vira ADR nova.

- **Tipo de instância — `t3.micro` aceito como restrição didática:**
  começamos em `t3.micro` (1 vCPU, 916 MiB RAM, sem swap) sabendo que
  **não cabe a stack completa Fase 0**. Tratamos como exercício de
  capacity planning real, no espírito do brief §5.4 ("riscos
  didaticamente aceitáveis"). Critério de revisão: **revisitar quando
  observability stack (Grupo G) entrar e provarmos com medição que não
  cabe**. Não pré-comprometemos upgrade — esperamos a evidência.

- **Acesso administrativo via SSM Session Manager (zero portas inbound):**
  decisão peer registrada em **ADR-0009**. SSH público proibido pelos
  argumentos de defense in depth (brief §0.1).

- **Autenticação humana via IAM Identity Center (SSO):** usuário `allysson`
  em permission set `AdministratorAccess` (broad agora; vai ser escopado
  depois). Tokens temporários de 8h via STS. Sem credenciais long-lived
  em disco. Setup já concluído nesta sessão.

- **Cost protection mandatória — AWS Budget mensal de USD 30:**
  notificações por email (`allyssoncsf@gmail.com`) em 4 thresholds: 17%
  (~$5), 50% (~$15), 100% ($30) ACTUAL e 100% FORECASTED. Sem Budget
  configurado, qualquer outra atividade na conta vira pegadinha cara.
  Setup já concluído nesta sessão.

- **State persistente fora do EBS root:** dados que precisam sobreviver
  ao terminate (Postgres, Redis, volumes Loki/Prometheus etc) ficam em
  **EBS volume separado**, anexável entre lifecycles. Custo: ~$0.10 por
  GB/mês. Volume **ainda não criado** — será em P0-C5 (estrutura de
  diretórios na VPS, agora "na EC2") ou quando o primeiro stateful
  service entrar. Decisão registrada agora pra evitar "esqueci de
  separar" depois.

- **Endereço IP estável via Elastic IP:** alocado durante uso ativo
  (gratuito enquanto associado a instância running). Quando longa pausa
  for prevista, liberar EIP (custo idle: ~$3.60/mês). Trade-off: liberar
  EIP exige reapontar Cloudflare na próxima subida (manual via API ou
  console). EIP **ainda não alocado** — fica como pré-requisito da próxima
  ação concreta (P0-B2: Cloudflare DNS).

- **Tags policy obrigatória em toda resource criada (manual ou IaC):**
  - `Project=ecommerce-microsservicos`
  - `Environment={sandbox|staging|prod}` (`sandbox` = experimentação;
    `staging`/`prod` quando entrarem os ambientes formais)
  - `ManagedBy={manual|terraform|ansible}` (`manual` por enquanto;
    converte pra `terraform` quando OpenTofu importar)

  Tags habilitam: cleanup em massa (`aws ec2 describe-instances --filters
"Name=tag:Project,Values=ecommerce-microsservicos"`), cost allocation no
  Cost Explorer, e auditoria de drift entre IaC e estado real.

- **OIDC para GitHub Actions assumir role AWS:** quando Grupo F entrar,
  CD vai usar OIDC trust em vez de access keys long-lived em GitHub
  Secrets. Decisão peer fica para ADR específica do Grupo F (mas a
  intenção é registrada aqui pra evitar regredir pra access keys).

- **OpenTofu fica habilitado pra IaC AWS desde P0-D1:** o que era
  "OpenTofu apenas para Cloudflare" no brief §5.5 vira "OpenTofu para
  Cloudflare + AWS (VPC, IAM, EC2, EBS, EIP, Security Groups)". Migração
  dos recursos manuais criados nesta sessão para state OpenTofu fica
  como tarefa específica de P0-D1.

**Itens fora do escopo desta ADR** (cada um terá decisão própria):

- Mecanismo de admin access (ADR-0009 peer);
- Estratégia OIDC GitHub Actions ↔ AWS (Grupo F);
- Estratégia de backup EBS + DLM (Data Lifecycle Manager) — virá quando
  primeiro stateful service entrar;
- Migração para `sa-east-1` ou multi-region (futuro distante);
- Migração para EKS / RDS / ElastiCache managed (Phase 2+ se justificar).

## Consequências

**Positivas:**

- **Skills AWS portáveis** — IAM, VPC, EC2, EBS, Security Groups, IAM
  Identity Center, SSM, CloudTrail, Budgets — todas conceitos de
  mercado. Projeto educacional vira artefato citável em portfolio.
- **IaC drasticamente mais rica** — OpenTofu provider AWS é maduro;
  exercitamos VPCs, subnets, IAM, EBS desde P0-D1 (não só Cloudflare).
- **Multi-nó futuro trivial** — Fase 2 do brief (k3s multi-nó) vira
  `tofu apply -var instance_count=2` em vez de comprar VPS adicional.
- **Snapshots / AMIs habilitam exercícios novos** — golden image, chaos
  engineering, recriação do zero, blue/green via launch template.
- **Role-based auth via IMDS substitui credenciais long-lived** —
  serviços rodando na EC2 ganham creds temporárias rotacionadas
  automaticamente; eliminamos uma classe inteira de leak risks.
- **CloudTrail audit logging gratuito** — toda ação na conta logada;
  base para compliance (SOC 2 / LGPD) que o brief planeja.
- **Tokens humanos short-lived (8h)** via Identity Center substituem
  acesso SSH com chaves long-lived que ficariam na máquina dev.

**Negativas / trade-offs aceitos:**

- **t3.micro vai ser limite real** — 916 MiB de RAM não cabem stack Fase
  0 completa. Vamos hit o limite em algum momento entre P0-G\* (LGTM
  stack) e provavelmente fazer upgrade ou simplificar. Tratamos como
  exercício de capacity planning, não falha — mas é fricção real;
- **Custo recorrente** — não estamos no free tier. Estimativa baseline
  com EC2 running 24/7: ~$8-10/mês t3.micro + ~$1/mês EBS + tráfego.
  Modelo ephemeral (`stop` quando não dev) reduz para ~$2-4/mês.
  Budget de $30 cobre operação normal; ultrapassagem = sinal de algo
  esquecido;
- **Surface area AWS é vasta** — solo dev vai bater em "Access Denied"
  misterioso, NAT Gateway esquecido cobrando $32/mês, EBS órfão.
  Mitigação: Budget como early warning + tags como base de cleanup +
  CloudTrail pra auditoria;
- **Latência Brasil → us-east-1 ~140ms** — não é prod real para
  audiência BR. Aceito porque escopo é educacional/simulação, não
  produção;
- **Conta única (sem isolação por account)** — blast radius de erro =
  conta inteira. Mitigação parcial: Identity Center permissions sets
  vão ser escopados a partir do primeiro deploy formal;
- **Pivotada quebra `PROJECT_BRIEF.md` v1.0** — §5.4 escreveu Hostinger.
  Tratamos via **adendo** no brief (não rewrite — preserva história de
  planejamento) + esta ADR como source of truth. Risk: leitor de §5.4
  desatento pode seguir caminho antigo. Mitigação: §5.4 ganha banner no
  topo apontando pra ADR-0008.

**Neutras / a observar:**

- **Hostinger sunk cost** — usuário não confirmou se já contratou; se
  sim, pedaço perdido. Se não, sem impacto;
- **Ferramentas instaladas localmente nesta sessão:** AWS CLI v2.34.41
  (`~/.local/bin/aws`), session-manager-plugin v1.2.814.0
  (`~/.local/bin/session-manager-plugin`) — ambos seguem o padrão
  per-user-no-sudo de gitleaks (P0-A5). `tools/install-dev-tools.sh`
  pode receber pinning dessas em futura iteração;
- **Recursos AWS criados nesta sessão (estado fora-do-IaC, tag
  `ManagedBy=manual`):** EC2 `i-072708190abd3d102`, IAM Role
  `EcommerceEC2SSMRole`, IAM Instance Profile `EcommerceEC2SSMRole`,
  Security Group `sg-06f620dffedd9008f` (anteriormente
  `launch-wizard-2`), AWS Budget `ecommerce-microsservicos-monthly-30usd`,
  IAM Identity Center user `allysson` + permission set
  `AdministratorAccess`. Todos serão importados pro state OpenTofu em
  P0-D1 (`tofu import ...`); tag `ManagedBy` muda pra `terraform` no
  mesmo PR.

## Alternativas consideradas

- **A. Switch total para AWS EC2 (escolhida)** — recomendada pelo balanço
  de skills AWS (alto valor portfolio) + flexibilidade ephemeral.
  Trade-offs aceitos com mitigations explícitas: Budget contra cost
  surprise, t3.micro como restrição didática, tags policy obrigatória,
  ADR junto registrando consciência dos riscos.
- **B. Hostinger como prod-shaped + EC2 como sandbox de exercícios
  elásticos** — descartada. Modelo respeitaria §5.4 fiel (single VPS =
  restrição dura), mas exigiria solo dev manter dois sistemas paralelos
  durante toda Fase 0. Sobrecarga grande pra ganho marginal de "ter as
  duas experiências".
- **C. Manter Hostinger conforme §5.4 original** — descartada. Mais
  simples, mais fiel ao brief, mas perde os ganhos AWS (portfolio, IaC
  rica, snapshots, ephemeral) que justificam o pivot. Cada nova fase do
  projeto reabriria a pergunta "deveríamos ter ido pra AWS?".
- **D. Switch para AWS, mas para serviços managed (Beanstalk / App
  Runner / ECS Fargate / EKS)** — adiada. Reduz surface area inicial
  mas: (i) custo estourador rápido (Fargate ~$30/mês mínimo apenas pra
  ter capacidade); (ii) abstrai exatamente os conceitos didáticos que
  queremos exercitar (containers, networking, deploy patterns).
  Considerar quando primeiro serviço de produto entrar e justificar
  `ECS` ou `EKS` (Fase 2+).
- **E. Multi-account (Organizations + dev/staging/prod accounts
  separadas)** — adiada. Best practice AWS, mas overkill para solo dev
  educacional sem requisitos de compliance reais hoje. Vira ADR quando
  houver razão concreta (ex.: separar billing, separar blast radius
  pre-prod/prod, requisito externo).

## Referências

- `PROJECT_BRIEF.md` §0.1 (segurança como prioridade), §5.4 (caminho de
  execução — versão original Hostinger, preservada com adendo apontando
  pra esta ADR), §5.5 (IaC — OpenTofu agora abrange AWS além de
  Cloudflare)
- ADR-0006 (cutover público — relevante porque conta AWS de educational
  rodando código em repo público exige rigor de tags + Budget + IAM
  scoping)
- ADR-0007 (CodeQL SAST — peça paralela do mesmo "raise the bar"
  defensivo pré-código)
- **ADR-0009** (substituir SSH por SSM Session Manager — decisão peer
  desta, mesma sessão de design)
- `docs/backlog/phase-0.md` P0-B4 (reescrita nesta PR para refletir o
  pivot)
- AWS docs — [AWS Free Tier — what counts](https://aws.amazon.com/free/),
  [EC2 instance types](https://aws.amazon.com/ec2/instance-types/),
  [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html),
  [IAM Identity Center](https://docs.aws.amazon.com/singlesignon/),
  [Tagging best practices](https://docs.aws.amazon.com/general/latest/gr/aws_tagging.html)
