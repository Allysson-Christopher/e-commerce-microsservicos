# AWS — estado atual da plataforma de execução

> **Para que serve este documento:** registro **declarativo** dos recursos AWS
> que sustentam o projeto desde o pivot da ADR-0008. Análogo a
> `docs/infra/cloudflare.md` (DNS) e `docs/infra/ghcr.md` (registry); aqui
> cobrimos compute (EC2 + EBS), rede (Security Group + EIP), identidade (IAM
> Role + Identity Center), governança (Budget + tags) e admin access (SSM).
>
> **Estado em IaC vs aqui:** todos os recursos abaixo nasceram **manualmente**
> nesta sessão e nas anteriores (tag `ManagedBy=manual` quando presente). Vão
> ser importados pra state OpenTofu em **P0-D1** (`tofu import`); este doc
> permanece como espelho legível por humano após o import.
>
> **Última atualização:** 2026-05-02 (cleanup pré-D1 — backfill de tags pelos 5 recursos legacy via `EcommerceProjectAdmin`; gaps 1, 2 e 4 fechados).

---

## Identidade da conta

| Campo                   | Valor                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| **Account ID**          | `905418198749`                                                         |
| **Home region**         | `us-east-1` (Northern Virginia) — fixa pelo Identity Center            |
| **Profile SSO local**   | `AdministratorAccess-905418198749` (em `~/.aws/config`)                |
| **Profile env var**     | `AWS_PROFILE=AdministratorAccess-905418198749` (no `~/.bashrc` do dev) |
| **AWS CLI**             | v2.34.41 em `~/.local/bin/aws` (per-user, sem sudo)                    |
| **Free tier elegível?** | Não (passou dos 12 meses)                                              |

**Por que `us-east-1`:** região onde a EC2 inicial foi provisionada e onde o
Identity Center foi habilitado (home region é imutável sem deletar/recriar
o Identity Center). Migração para `sa-east-1` (latência BR) fica como ADR
futura se justificar.

---

## IAM Identity Center (SSO)

| Campo                 | Valor                                                      |
| --------------------- | ---------------------------------------------------------- |
| **Instance ARN**      | `arn:aws:sso:::instance/ssoins-72230cf4411d9bf7`           |
| **Identity Store ID** | `d-9067e0b68e`                                             |
| **Usuário**           | `allysson` (UserId `442824d8-4071-701c-c764-3520d57bd5f5`) |
| **MFA**               | TOTP (Bitwarden / Aegis), enforced                         |
| **Token lifetime**    | 8h via STS                                                 |
| **SSO start URL**     | `https://ssoins-72230cf4411d9bf7.portal.us-east-1.app.aws` |

### Permission sets

| Permission set                                             | Uso                                          | Session duration | Status    |
| ---------------------------------------------------------- | -------------------------------------------- | ---------------- | --------- |
| **`EcommerceProjectAdmin`** (default cotidiano — ADR-0012) | Operação normal do projeto                   | 8h               | Atribuído |
| `AdministratorAccess` (managed AWS, broad — break-glass)   | Emergência operacional / fluxos não cobertos | 8h               | Atribuído |

#### `EcommerceProjectAdmin` — default cotidiano

| Campo                  | Valor                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Permission set ARN** | `arn:aws:sso:::permissionSet/ssoins-72230cf4411d9bf7/ps-8b8093cc7c6e9d61`                                                            |
| **Reserved SSO Role**  | `AWSReservedSSO_EcommerceProjectAdmin_343d4e974f8bbd83`                                                                              |
| **Reserved Role ARN**  | `arn:aws:iam::905418198749:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_EcommerceProjectAdmin_343d4e974f8bbd83`                |
| **Policy**             | Inline (~14 KB), híbrida — tag-based + ARN-enumerated + `aws:RequestTag` enforcement + Deny defensivo. Ver ADR-0012 e runbook abaixo |
| **Tags**               | `Project`, `Environment=sandbox`, `ManagedBy=manual`                                                                                 |
| **Criado em**          | 2026-05-02 20:42 UTC                                                                                                                 |

**Login default:**

```bash
aws sso login --profile EcommerceProjectAdmin-905418198749
export AWS_PROFILE=EcommerceProjectAdmin-905418198749
```

**Cobertura conhecida** (validada no PR de P0-B6):

- ✅ Leitura ampla — `*:Describe*` / `*:List*` / `*:Get*` em EC2/S3/IAM/CloudTrail/Config/Budgets/SSM/CloudWatch/Logs
- ✅ SSM Session Manager (`StartSession` / `TerminateSession` / `SendCommand`) — sem condition de tag (ver "Dívidas conhecidas" abaixo)
- ✅ Mutações em recursos com tag `Project=ecommerce-microsservicos` (EIP, IAM Role `EcommerceEC2SSMRole`, audit bucket, trail)
- ✅ Mutações em recursos enumerados por ARN (audit bucket, Config recorder/pack/rule, Budget do projeto)
- ✅ `Create*` exigindo `aws:RequestTag/Project=ecommerce-microsservicos`
- ✅ `ec2:CreateTags`/`DeleteTags` em recursos do projeto que estão em **gap** (EC2, Root EBS, SG, NIC) — pra fechar follow-ups #1/#2/#3 sem voltar pro break-glass
- ❌ **AccessDenied esperado** em mutações sobre recursos legacy fora do projeto (7 buckets S3 legacy + ACM certs + default VPC SGs) — defesa em camadas
- ❌ **AccessDenied explícito (Deny)** em `iam:CreateUser/DeleteUser/Create*AccessKey`, `iam:DeleteRole`, `organizations:*`, `account:*`, `aws-portal:Modify*`, `sso:Delete*PermissionSet/Update*`, `kms:DisableKey/ScheduleKeyDeletion`, `s3:DeleteBucket/Object` no audit bucket, `cloudtrail:DeleteTrail/StopLogging` no trail do projeto

**Dívidas conhecidas** (registradas com a policy):

- **Gap #1 (EC2 sem tag `Project`):** `ec2:StopInstances`/`StartInstances`/`RebootInstances`/`TerminateInstances` na EC2 retornam `AccessDenied` até a tag ser aplicada. Mitigação: a própria policy concede `ec2:CreateTags` ARN-enumerado pra EC2/Root EBS/SG/NIC — backfill de tags pode ser feito pelo próprio `EcommerceProjectAdmin` em PR pré-D1, sem break-glass.
- **SSM `StartSession` sem condition:** EC2 ainda no gap #1; aplicar tag-based em SSM trancaria admin access (conflito direto com ADR-0009). Aceito até gap #1 fechar — ADR de revisão depois reaperta.
- **Recursos `Create*` "untaggable" no `RunInstances`** (subnet, security-group existente, key-pair, launch-template, image, snapshot) ficam em statement separado sem `aws:RequestTag` — necessário pelo modelo da API EC2 que distingue ARNs taggable vs não-taggable em RunInstances.

#### `AdministratorAccess` — break-glass

Mantido como **rede de segurança** (solo dev sem segundo humano de reserva). Uso esperado: emergência operacional onde `EcommerceProjectAdmin` recusa fluxo crítico, ou tarefa fora-do-escopo (criar permission set novo, mexer em recursos pessoais legacy).

| Campo                 | Valor                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reserved SSO Role** | `AWSReservedSSO_AdministratorAccess_5bf24a712652a374`                                                                                                                                                       |
| **Status**            | Atribuído (não removido)                                                                                                                                                                                    |
| **Auditoria**         | CloudTrail registra todo `AssumeRoleWithSAML` com sourceIPAddress + principal — uso indevido fica visível em revisão reativa. Alarm proativo (EventBridge / Slack notify) é follow-up de Grupo H ou Phase 4 |

**Login break-glass:**

```bash
aws sso login --profile AdministratorAccess-905418198749
export AWS_PROFILE=AdministratorAccess-905418198749
```

**Procedimento esperado quando usar break-glass:**

1. Constatar que `EcommerceProjectAdmin` recusa fluxo legítimo (e não é caso de bug óbvio na policy).
2. Trocar profile e fazer só **a operação mínima** que destrava.
3. Voltar pro `EcommerceProjectAdmin` imediatamente após.
4. Abrir issue ou TODO no `aws-specs.md` "Follow-ups conhecidos" pra ajustar a policy se o caso for recorrente.

**Princípios em uso:**

- **Sem credenciais long-lived** — humano usa SSO (8h), agent usa Instance Profile (rotação automática via STS).
- **MFA obrigatório** no fator humano (enforced no nível do diretório).
- **Least privilege real, não broad** — `EcommerceProjectAdmin` cobre 100% do fluxo Phase 0 cotidiano; `AdministratorAccess` segue como rede de segurança auditada.
- **Disciplina de tag enforced no IAM** — `aws:RequestTag` em `Create*` faz a AWS recusar criação de recurso novo sem `Project=ecommerce-microsservicos`.

---

## EC2

| Campo                 | Valor                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Instance ID**       | `i-072708190abd3d102`                                                                                    |
| **Tipo**              | `t3.micro` (1 vCPU burstable, 916 MiB RAM, sem swap padrão)                                              |
| **AMI**               | `ami-098e39bafa7e7303d` (Amazon Linux 2023)                                                              |
| **Plataforma**        | Amazon Linux 2023                                                                                        |
| **AZ**                | `us-east-1b`                                                                                             |
| **VPC**               | `vpc-07c616c1c8e449677` (default VPC da conta)                                                           |
| **IP privado**        | `172.31.36.245`                                                                                          |
| **IP público**        | `32.193.69.140` (via EIP — ver abaixo)                                                                   |
| **Launch time**       | 2026-04-30 21:18 UTC                                                                                     |
| **Lifecycle**         | **Ephemeral** — `stop` quando não em uso                                                                 |
| **EBS-optimized**     | `true`                                                                                                   |
| **Root device**       | `/dev/xvda`                                                                                              |
| **IMDSv2**            | `HttpTokens=required` (v1 desabilitado)                                                                  |
| **IMDS hop limit**    | `2`                                                                                                      |
| **Tag `Name`**        | `loja-microsservicos` (legado — preservado intencionalmente; rename via recreate em P0-D1, follow-up #7) |
| **Tag `Project`**     | `ecommerce-microsservicos` ✅                                                                            |
| **Tag `Environment`** | `sandbox` ✅                                                                                             |
| **Tag `ManagedBy`**   | `manual` ✅                                                                                              |

**Lifecycle ephemeral em prática:**

- Subir antes de uma sessão de dev: `aws ec2 start-instances --instance-ids i-072708190abd3d102`
- Derrubar ao fim: `aws ec2 stop-instances --instance-ids i-072708190abd3d102`
- Custo running 24/7: ~$7.60/mês t3.micro on-demand. Stopped: $0 compute (mas paga storage do root EBS).
- **Preserva root EBS** entre stops (8 GiB persistente). Terminate **destroi** root (`DeleteOnTermination=true`).

**IMDSv2 enforced:** elimina exfiltração de credenciais via SSRF (atacante
explorando proxy HTTP da app teria que forjar PUT autenticado pra tomar token,
não basta GET ingenuo a `169.254.169.254`).

---

## EBS

### Root volume (atual)

| Campo                   | Valor                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Volume ID**           | `vol-03f00b3758be2f0c8`                                                                   |
| **Tipo**                | gp3                                                                                       |
| **Tamanho**             | 8 GiB                                                                                     |
| **IOPS / throughput**   | 3000 IOPS / 125 MB/s (baseline gp3, sem cobrança extra)                                   |
| **Encryption at rest**  | **disabled** (default da AMI; ver follow-up #3 — adiado pra Phase 2 ou recreate em P0-D1) |
| **AZ**                  | `us-east-1b`                                                                              |
| **Attach point**        | `/dev/xvda`                                                                               |
| **DeleteOnTermination** | `true` — terminate da EC2 destrói o root                                                  |
| **Tag `Project`**       | `ecommerce-microsservicos` ✅                                                             |
| **Tag `Environment`**   | `sandbox` ✅                                                                              |
| **Tag `ManagedBy`**     | `manual` ✅                                                                               |
| **Tag `Name`**          | `ecommerce-ec2-root` ✅                                                                   |

### Volumes adicionais

**Nenhum hoje.** Decisão consciente registrada no PR de P0-B4 (e
referenciada em ADR-0008): volume separado **não** será criado
especulativamente. Espera o primeiro consumidor real chegar (Postgres,
Redis, ou o stack LGTM em P0-G\*) — quem definir requisitos de IOPS,
throughput, AZ e tamanho.

#### Política default para volumes novos

Quando criar (em P0-C5 ou em tarefa de Grupo G/Fase 1):

- **Tipo:** **gp3** por default. Baseline gp3 (3000 IOPS / 125 MB/s) cobre
  caso geral; mais barato que gp2 pra IOPS equivalentes (gp2 cobra IOPS
  proporcionais ao tamanho; gp3 cobra storage independente).
- **AZ:** mesma da EC2 que vai consumir (volume não cruza AZ).
- **Encryption:** **enabled** com KMS key default da conta (`alias/aws/ebs`).
  Mudança vs root atual — corrige o gap de defense in depth (brief §0.1).
- **DeleteOnTermination:** `false` para volumes de dados (ao contrário do
  root) — sobrevivem ao terminate da EC2.
- **Tags:** policy completa do ADR-0008 (`Project`, `Environment`,
  `ManagedBy`, `Name`).
- **Snapshots:** Data Lifecycle Manager (DLM) — adiado pra Fase 2.

**Quando revisitar gp3 → io2:** se workload exigir IOPS sustained > 3000
ou latência p99 < 1ms (Postgres OLTP intensivo, search com índice grande
em RAM, etc). Não acontece em Phase 0.

**ADR específica gp3 vs gp2:** **não criada**. Decisão foi pequena demais
pra ADR no momento da escolha (gp2 hoje é legacy AWS; gp3 é o default
moderno). Se P0-C5 trouxer surpresa (precisar io2, múltiplos volumes,
estratégia de snapshots não-trivial), aí nasce ADR.

---

## Elastic IP (EIP)

| Campo                 | Valor                         |
| --------------------- | ----------------------------- |
| **Public IP**         | `32.193.69.140`               |
| **Allocation ID**     | `eipalloc-03c82731695e04b80`  |
| **Association ID**    | `eipassoc-0e14542cccf1bb90c`  |
| **Network Interface** | `eni-03b0c211e0823308c`       |
| **Pool**              | `amazon` (não BYOIP)          |
| **Border group**      | `us-east-1`                   |
| **Associado a**       | `i-072708190abd3d102`         |
| **Tag `Name`**        | `ecommerce-ec2-eip`           |
| **Tag `Project`**     | `ecommerce-microsservicos` ✅ |
| **Tag `Environment`** | `sandbox` ✅                  |
| **Tag `ManagedBy`**   | `manual` ✅                   |

**Cost trade-off (AWS pricing 2026):**

- EIP **associado a EC2 running** = **gratuito**.
- EIP **idle** (associado a EC2 stopped, ou desassociado) = **~$3.60/mês**
  (~$0.005/hora).
- Para longas pausas (>1 dia stopped), considerar **release** do EIP — perde
  o IP fixo, na próxima subida pega novo IP, e Cloudflare DNS precisa ser
  reapontado (manual via API ou painel).

Hoje EC2 está running, custo do EIP = $0.

**Origem da Cloudflare:** este EIP é o `Origin` referenciado em
`docs/infra/cloudflare.md` — todos os 5 registros DNS proxied apontam
para ele.

---

## Security Group

| Campo                 | Valor                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Group ID**          | `sg-06f620dffedd9008f`                                                                       |
| **Nome do SG**        | `launch-wizard-2` (legado — rename exige recreate; follow-up #7 em P0-D1)                    |
| **VPC**               | `vpc-07c616c1c8e449677`                                                                      |
| **Ingress**           | **vazio** (zero portas inbound)                                                              |
| **Egress**            | `all/all → 0.0.0.0/0` (necessário pro SSM agent)                                             |
| **Tag `Project`**     | `ecommerce-microsservicos` ✅                                                                |
| **Tag `Environment`** | `sandbox` ✅                                                                                 |
| **Tag `ManagedBy`**   | `manual` ✅                                                                                  |
| **Tag `Name`**        | `ecommerce-ec2-sandbox-sg` ✅ (tag Name; **`Nome do SG`** acima permanece `launch-wizard-2`) |

**Postura de rede:**

- Zero ingress = atacante na internet **não consegue iniciar TCP handshake**
  com a instância (decisão da ADR-0009).
- Egress all = SSM agent precisa alcançar `ssm.us-east-1.amazonaws.com`,
  `ssmmessages.us-east-1.amazonaws.com`, `ec2messages.us-east-1.amazonaws.com`
  via HTTPS/443 outbound. Quando entrarmos em VPC privada (Fase 2), considerar
  VPC Endpoints + restringir egress.

**Histórico:**

- 2026-04-30: SG criado pelo launch wizard com `tcp/22 ← 0.0.0.0/0` (default
  permissive).
- 2026-05-01: ingress 22/tcp **revogado** (regra `sgr-01305bd44277c627c`)
  como parte da ADR-0009. SG passou a ter zero ingress.

---

## IAM Role + Instance Profile

| Campo                     | Valor                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **Role name**             | `EcommerceEC2SSMRole`                                                                  |
| **Role ARN**              | `arn:aws:iam::905418198749:role/EcommerceEC2SSMRole`                                   |
| **Instance Profile name** | `EcommerceEC2SSMRole` (mesmo nome, wrapping API legado)                                |
| **Instance Profile ARN**  | `arn:aws:iam::905418198749:instance-profile/EcommerceEC2SSMRole`                       |
| **Trust principal**       | `ec2.amazonaws.com`                                                                    |
| **Attached policies**     | `arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore` (managed AWS)                   |
| **Tags Role**             | `Project=ecommerce-microsservicos` ✅, `Environment=sandbox` ✅, `ManagedBy=manual` ✅ |
| **Created**               | 2026-05-01 22:08 UTC                                                                   |

A `AmazonSSMManagedInstanceCore` cobre o mínimo pro Session Manager + Run
Command + Patch Manager funcionarem (sem permissões a mais). Role foi
anexada à EC2 via Instance Profile homônimo (limitação histórica da API
EC2 — anexa Instance Profile, não Role direto).

---

## SSM Session Manager

| Campo               | Valor                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| **Agent version**   | `3.3.4108.0` (pré-instalado em AL2023)                                         |
| **Plataforma**      | Amazon Linux 2023                                                              |
| **Ping status**     | `Online` (último ping em 2026-05-02 15:03 UTC)                                 |
| **Plugin local**    | `session-manager-plugin` v1.2.814.0 em `~/.local/bin/`                         |
| **CloudTrail logs** | habilitados (default da conta) — `StartSession`/`TerminateSession` registrados |

**Comando padrão:**

```bash
aws ssm start-session --target i-072708190abd3d102
```

Drop em shell como `ssm-user` (sudo NOPASSWD). Para shell como `root` ou
comandos não-interativos:

```bash
aws ssm send-command \
  --document-name AWS-RunShellScript \
  --instance-ids i-072708190abd3d102 \
  --parameters 'commands=["sudo whoami"]'
```

**Logging detalhado de sessões** (output completo para S3/CloudWatch
Logs): **não habilitado**. Adiar pra Grupo H ou exercício futuro de
compliance.

---

## AWS Budget

| Campo                 | Valor                                     |
| --------------------- | ----------------------------------------- |
| **Nome**              | `ecommerce-microsservicos-monthly-30usd`  |
| **Tipo**              | `COST` mensal                             |
| **Limite**            | $30 USD/mês                               |
| **Início**            | 2026-05-01                                |
| **Thresholds**        | 17% / 50% / 100% ACTUAL + 100% FORECASTED |
| **Notificações**      | email → `allyssoncsf@gmail.com`           |
| **Health status**     | HEALTHY                                   |
| **Spend atual (mês)** | $0.151 (snapshot em 2026-05-02)           |

Sem Budget, a cobrança AWS é uma pegadinha silenciosa. 17% (~$5) é o
**early warning real** — se chegar lá no início do mês, algo está
rodando inesperado.

---

## Audit & Compliance

> **Habilitado em 2026-05-02 via P0-B5.** Decisões + alternativas em
> ADR-0011; reproduzir do zero via `docs/runbooks/aws-audit-baseline.md`.

### S3 audit bucket

| Campo               | Valor                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bucket**          | `ecommerce-microsservicos-audit-905418198749`                                                                                                              |
| **Region**          | `us-east-1`                                                                                                                                                |
| **Encryption**      | SSE-S3 (AES-256, managed pelo S3); `BlockedEncryptionTypes=SSE-C`                                                                                          |
| **Versioning**      | Enabled                                                                                                                                                    |
| **Public access**   | Bloqueado nas 4 dimensões (BlockPublicAcls + IgnorePublicAcls + BlockPublicPolicy + RestrictPublicBuckets)                                                 |
| **Lifecycle**       | 90d Standard → 365d Glacier IR → expirar (455d totais); transitions/expiration aplicados também a noncurrent versions; AbortIncompleteMultipartUpload=7d   |
| **Bucket policy**   | 7 statements: 5 Allow para CloudTrail/Config services nos respectivos prefixos; 1 Deny para non-SSL; 1 Deny para `s3:DeleteObject*` por qualquer principal |
| **Tags**            | Project, Environment=sandbox, ManagedBy=manual, Name=ecommerce-audit-bucket                                                                                |
| **Prefixos em uso** | `cloudtrail/AWSLogs/905418198749/...` (CloudTrail); `config/AWSLogs/905418198749/Config/...` (AWS Config)                                                  |

> **Pegadinha conhecida:** lifecycle expiration **continua funcionando**
> mesmo com Deny `s3:DeleteObject*` na policy — expiration é operação
> interna do S3 sem IAM principal. A Deny só afeta delete iniciado por
> usuário/role (defensa contra delete acidental). Pra deletar manual em
> emergência, primeiro remover essa statement (operação logada).

### CloudTrail trail

| Campo                       | Valor                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **Nome**                    | `ecommerce-microsservicos-management-trail`                                                 |
| **ARN**                     | `arn:aws:cloudtrail:us-east-1:905418198749:trail/ecommerce-microsservicos-management-trail` |
| **Multi-region**            | `true`                                                                                      |
| **Include global services** | `true` (IAM, STS, CloudFront, Route 53)                                                     |
| **Eventos**                 | Management read+write apenas — sem data events, sem Insights                                |
| **Log file validation**     | Enabled (digest assinado por hora)                                                          |
| **Destino**                 | `s3://ecommerce-microsservicos-audit-905418198749/cloudtrail/`                              |
| **Logging**                 | Active desde 2026-05-02 17:19:27 UTC                                                        |
| **Tags**                    | Project, Environment=sandbox, ManagedBy=manual, Name=ecommerce-management-trail             |

**Quando ativar data events / Insights:**

- **Data events** quando primeiro bucket de dados real do projeto entrar
  (Phase 1 — backups Postgres, uploads de cliente, etc.). Custo $0.10/100k
  events; controlado por scope (selector pra buckets específicos do projeto).
- **Insights** quando volume de chamadas API tiver baseline estável
  (~Phase 1 estável + Phase 2). Custo $0.35/100k analyzed; sem baseline,
  vira alerta ruidoso em conta nova.

### AWS Config

| Campo                      | Valor                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Recorder**               | `default`                                                                                      |
| **Recording strategy**     | `ALL_SUPPORTED_RESOURCE_TYPES` + `includeGlobalResourceTypes=true`                             |
| **Service-linked role**    | `arn:aws:iam::905418198749:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig` |
| **Delivery channel**       | `default` → `s3://ecommerce-microsservicos-audit-905418198749/config/`                         |
| **Snapshot delivery freq** | 24h                                                                                            |
| **Status**                 | recording=true, lastStatus=SUCCESS (snapshot 2026-05-02 17:20 UTC)                             |

#### Conformance pack

| Campo              | Valor                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nome**           | `ecommerce-OBP-EC2`                                                                                                                                           |
| **ARN**            | `arn:aws:config:us-east-1:905418198749:conformance-pack/ecommerce-OBP-EC2/conformance-pack-ctqux7q7m`                                                         |
| **Template fonte** | `Operational-Best-Practices-for-EC2.yaml` do repo `awslabs/aws-config-rules` (master branch)                                                                  |
| **Customizações**  | Nenhuma (template AWS-managed aplicado as-is)                                                                                                                 |
| **Regras**         | ~10 best-practices EC2 (`ec2-imdsv2-check`, `restricted-ssh`, `incoming-ssh-disabled`, `instance-managed-by-systems-manager`, `ec2-volume-inuse-check`, etc.) |

#### Regra customizada `required-tags-Project`

| Campo                | Valor                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**           | AWS managed (`SourceIdentifier=REQUIRED_TAGS`)                                                                                                                          |
| **Input parameters** | `tag1Key=Project`, `tag1Value=ecommerce-microsservicos`                                                                                                                 |
| **Scope**            | 7 tipos: `AWS::EC2::Instance`, `AWS::EC2::Volume`, `AWS::EC2::SecurityGroup`, `AWS::EC2::NetworkInterface`, `AWS::EC2::EIP`, `AWS::IAM::Role`, `AWS::CloudTrail::Trail` |
| **State**            | ACTIVE                                                                                                                                                                  |

Estado de compliance pós-scope (snapshot 2026-05-02):

| Status                                                    | Recursos                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NON_COMPLIANT**                                         | `i-072708190abd3d102` (EC2 do projeto, gap #1), `eni-03b0c211e0823308c` (NIC), `sg-06f620dffedd9008f` (SG do projeto, gap #2), `vol-03f00b3758be2f0c8` (Root EBS, gap #3 parcial), `sg-0552b53b7019d8285` + `sg-08e5ae3785b5210df` (default SGs da default VPC — irredutíveis sem deletar a VPC) |
| **COMPLIANT** (esperado após inventário Config completar) | EIP `eipalloc-03c82731695e04b80`, IAM Role `EcommerceEC2SSMRole`, Trail criado nesta sessão                                                                                                                                                                                                      |

> **Resource types não cobertos hoje:** S3 buckets do projeto futuro
> (Phase 1) ficam **fora** do scope dessa regra porque incluir
> `AWS::S3::Bucket` capturaria 7 buckets legacy não relacionados ao
> projeto na conta. Cobertura via custom rule (Lambda) com filtro de
> nome — fica para Phase 1 quando o primeiro bucket de dados nascer.

### Achados notáveis

- **Conta compartilhada com legacy.** A conta `905418198749` tem 7
  buckets S3 pré-existentes não relacionados ao projeto, 2 ACM
  certificates pré-existentes, e a default VPC inteira da AWS. Isso
  motivou o scope explícito da regra `required-tags-Project` —
  detalhado no histórico de design da ADR-0011.
- **2 SGs default da default VPC são NON_COMPLIANT permanentes.**
  AWS default VPC nasce sem tags em seus SGs default; aplicar tag
  `Project=ecommerce-microsservicos` neles seria fraude (não são "do
  projeto"). Aceito como noise irredutível até decidir migrar pra VPC
  custom (Fase 2+ se justificar).

---

## Tags policy

Padrão obrigatório (ADR-0008) em **todo recurso AWS criado**:

```
Project=ecommerce-microsservicos
Environment={sandbox|staging|prod}
ManagedBy={manual|terraform|ansible}
```

**Estado atual de conformidade** (espelho honesto, 2026-05-02 pós-cleanup):

| Recurso                                               | Project | Environment | ManagedBy | Name                                          | Status                                       |
| ----------------------------------------------------- | ------- | ----------- | --------- | --------------------------------------------- | -------------------------------------------- |
| EIP `eipalloc-03c82731695e04b80`                      | ✅      | ✅          | ✅        | ✅                                            | **OK**                                       |
| S3 audit bucket                                       | ✅      | ✅          | ✅        | ✅                                            | **OK**                                       |
| CloudTrail trail `ecommerce-...-management-trail`     | ✅      | ✅          | ✅        | ✅                                            | **OK**                                       |
| EC2 `i-072708190abd3d102`                             | ✅      | ✅          | ✅        | ⚠️ `loja-microsservicos` (legado intencional) | **OK**                                       |
| Root EBS `vol-03f00b3758be2f0c8`                      | ✅      | ✅          | ✅        | ✅ `ecommerce-ec2-root`                       | **OK**                                       |
| Security Group `sg-06f620dffedd9008f`                 | ✅      | ✅          | ✅        | ✅ `ecommerce-ec2-sandbox-sg` (tag Name)      | **OK** (rename do nome do SG = follow-up #7) |
| NIC `eni-03b0c211e0823308c`                           | ✅      | ✅          | ✅        | ✅ `ecommerce-ec2-eni`                        | **OK**                                       |
| IAM Role `EcommerceEC2SSMRole`                        | ✅      | ✅          | ✅        | n/a                                           | **OK**                                       |
| Permission Set `EcommerceProjectAdmin`                | ✅      | ✅          | ✅        | n/a                                           | **OK**                                       |
| Instance Profile `EcommerceEC2SSMRole`                | n/a     | n/a         | n/a       | n/a                                           | (não suporta tags)                           |
| AWS Budget `ecommerce-...-monthly-30usd`              | n/a     | n/a         | n/a       | n/a                                           | (não suporta tags)                           |
| AWS Config recorder/delivery channel/conformance pack | n/a     | n/a         | n/a       | n/a                                           | (não suporta tags)                           |

**Detecção automática via Config rule `required-tags-Project`**: 4 dos 4 recursos
do projeto cobertos pela rule ficaram **COMPLIANT** após o backfill (validado
em 2026-05-02 via `start-config-rules-evaluation` + `get-compliance-details-by-config-rule`).
Os 2 NON_COMPLIANT permanentes (default SGs `sg-0552b53b7019d8285` e
`sg-08e5ae3785b5210df` da default VPC) seguem irredutíveis — registrados em ADR-0011.

---

## Follow-ups conhecidos (dívida explícita)

Lista honesta de divergências entre o estado real e a política/intenção
declarada. **Nenhum é blocker para fechar P0-B4** — todos serão endereçados
em PRs específicos antes ou durante P0-D1 (import OpenTofu).

| #   | Item                                                                                                                                                                                                                                                                  | Onde resolver                                                                                 | Severidade                                                                                                                | Auto-detectado?                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | ~~EC2 sem tags `Project`/`Environment`/`ManagedBy`~~ **RESOLVIDO em 2026-05-02 via cleanup pré-D1 (PR `chore/infra-backfill-tags-pre-d1`)**. Tag `Name=loja-microsservicos` preservada como legado intencional — rename via recreate em P0-D1 (item #7).              | n/a (fechado)                                                                                 | n/a                                                                                                                       | n/a                                                                                               |
| 2   | ~~Security Group sem tags~~ **RESOLVIDO em 2026-05-02 via cleanup pré-D1**. Nome do SG `launch-wizard-2` permanece (rename = item #7).                                                                                                                                | n/a (fechado pra tags)                                                                        | n/a                                                                                                                       | n/a                                                                                               |
| 3   | Root EBS **encryption-at-rest disabled** (tags resolvidas em 2026-05-02). Encryption não é resolvível por `create-tags` — exige snapshot → criar volume encrypted KMS → swap, com EC2 stopped.                                                                        | Adiado pra Phase 2 ou recreate via OpenTofu em P0-D1                                          | **média** — encryption-at-rest é defense in depth (brief §0.1); mitigação parcial: nada sensível em disco hoje (Phase 0)  | ✅ encryption via conformance pack futuro (Operational-Best-Practices-for-EBS), tags já COMPLIANT |
| 4   | ~~IAM Role sem tag `Environment`~~ **RESOLVIDO em 2026-05-02 via cleanup pré-D1**.                                                                                                                                                                                    | n/a (fechado)                                                                                 | n/a                                                                                                                       | n/a                                                                                               |
| 5   | ~~Permission set `AdministratorAccess` ainda broad~~ **RESOLVIDO em 2026-05-02 via P0-B6 / ADR-0012**                                                                                                                                                                 | n/a (fechado)                                                                                 | n/a                                                                                                                       | n/a                                                                                               |
| 6   | Logging detalhado de sessões SSM (S3/CloudWatch)                                                                                                                                                                                                                      | Grupo H ou tarefa específica                                                                  | baixa (compliance futuro)                                                                                                 | n/a (não é um gap de drift; é feature ausente)                                                    |
| 7   | SG `launch-wizard-2` rename → algo descritivo (`ecommerce-ec2-sandbox-sg`)                                                                                                                                                                                            | P0-D1 (recriar via `tofu`)                                                                    | baixa                                                                                                                     | n/a (rename só via recreate)                                                                      |
| 8   | `EcommerceProjectAdmin` policy (ADR-0012) **não cobre `config:BatchGetResourceConfig` na Layer1 ReadOnly broad** — descoberto durante cleanup pré-D1 ao tentar `aws configservice batch-get-resource-config`. Outras leituras de Config (Describe/Get/List) cobertas. | PR específico expandindo Layer1 da policy; aplicar via `put-inline-policy-to-permission-set`. | baixa (debug/observability tool; não bloqueia fluxo crítico — alternativa via `get-resource-config-history` está coberta) | ❌ não detectável por Config rule de tag                                                          |

**Ordem sugerida:**

- ~~Itens 1, 2, 4 (cleanup de tags via `create-tags`)~~ — fechados em 2026-05-02.
- Item 3 (encryption do root) merece PR específico ou recreate em P0-D1 — adiado por trade-off custo/valor explícito acima.
- Item 8 (policy gap descoberto) — PR pequeno expandindo Layer1; pode ser agrupado com qualquer outra ADR Phase 2 que mexer na policy.
- Itens 6, 7 esperam suas tarefas naturais.

---

## Custo estimado (referência)

Baseline mensal com a configuração atual e **EC2 running 24/7**:

| Item                                                  | $/mês       |
| ----------------------------------------------------- | ----------- |
| EC2 t3.micro on-demand                                | ~$7.60      |
| Root EBS 8 GiB gp3 (baseline)                         | ~$0.64      |
| EIP (associado e EC2 running)                         | $0.00       |
| SSM (Session Manager + Run Command)                   | $0.00       |
| CloudTrail management events (1º trail free)          | $0.00       |
| AWS Config recording + 1 conformance pack + 1 rule    | ~$0.30-1.00 |
| S3 audit bucket storage (cresce ~5-20 MB/mês inicial) | <$0.05      |
| Outbound traffic (estimativa Phase 0)                 | <$0.50      |
| **Total**                                             | **~$9-10**  |

Com modelo ephemeral (EC2 stopped quando não dev — ~16h/dia):

| Item                                | $/mês      |
| ----------------------------------- | ---------- |
| EC2 t3.micro (~8h/dia × 30)         | ~$2.50     |
| Root EBS 8 GiB gp3 (sempre running) | ~$0.64     |
| EIP (idle parte do tempo)           | até ~$2.40 |
| **Total**                           | **~$3-5**  |

Observação: **o EIP é o item que cresce** quando a EC2 fica stopped por
muito tempo. Para pausa longa (> 3 dias), considerar `release` do EIP +
reassociar quando subir; aceitar perda do IP fixo (Cloudflare reaponta).

Budget de $30/mês cobre tranquilamente operação Phase 0 inteira; um
spike acima do baseline = sinal de algo esquecido (NAT Gateway? EBS
órfão? snapshot retido?).

---

## Recursos `ManagedBy=manual` que entrarão em state OpenTofu (P0-D1)

Lista canônica para `tofu import`:

```
EC2:
  i-072708190abd3d102               → aws_instance.ecommerce_sandbox
  vol-03f00b3758be2f0c8 (root EBS)  → aws_ebs_volume.root (managed via aws_instance)

Rede:
  eipalloc-03c82731695e04b80        → aws_eip.ecommerce_ec2
  eipassoc-0e14542cccf1bb90c        → aws_eip_association.ecommerce_ec2
  sg-06f620dffedd9008f              → aws_security_group.ecommerce_sandbox
  vpc-07c616c1c8e449677             → data source (default VPC, não criar)

IAM:
  EcommerceEC2SSMRole (Role)            → aws_iam_role.ec2_ssm
  EcommerceEC2SSMRole (InstanceProfile) → aws_iam_instance_profile.ec2_ssm
  AmazonSSMManagedInstanceCore (attach) → aws_iam_role_policy_attachment.ssm_core
  AWSServiceRoleForConfig (service-linked) → não importar (gerenciado pela AWS)

Governança:
  ecommerce-microsservicos-monthly-30usd → aws_budgets_budget.monthly_30usd

Audit & Compliance:
  ecommerce-microsservicos-audit-905418198749 (S3 bucket)         → aws_s3_bucket.audit
                                                                    + aws_s3_bucket_versioning.audit
                                                                    + aws_s3_bucket_server_side_encryption_configuration.audit
                                                                    + aws_s3_bucket_public_access_block.audit
                                                                    + aws_s3_bucket_lifecycle_configuration.audit
                                                                    + aws_s3_bucket_policy.audit
                                                                    + aws_s3_bucket_tagging (via tags do bucket)
  ecommerce-microsservicos-management-trail (CloudTrail trail)    → aws_cloudtrail.management
  default (Config recorder)                                       → aws_config_configuration_recorder.default
  default (Config delivery channel)                               → aws_config_delivery_channel.default
  ecommerce-OBP-EC2 (Conformance pack)                            → aws_config_conformance_pack.ec2_best_practices
  required-tags-Project (Config rule)                             → aws_config_config_rule.required_tags_project
```

Identity Center user/permission set ficam **fora** do state OpenTofu por
enquanto (recurso humano, raramente muda — registrar como datasource ou
manual quando tarefa específica avaliar). Inclui:

- Permission set `EcommerceProjectAdmin` + inline policy
- Permission set `AdministratorAccess` (managed AWS, atribuído como break-glass)
- Account assignments dos dois permission sets ao usuário `allysson`

---

## Recovery — situações onde voltar aqui

| Situação                                  | Pular para                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conta AWS comprometida                    | Identity Center → revogar tokens, rotacionar MFA                                                                                                       |
| EC2 deletada acidentalmente               | Recriar via P0-D1 (OpenTofu) — ver follow-up #7                                                                                                        |
| EIP perdido / re-alocado com IP diferente | Atualizar Cloudflare records (manual ou via OpenTofu CF)                                                                                               |
| Token SSO expirou no meio de operação     | `aws sso login --profile AdministratorAccess-905418198749`                                                                                             |
| Cobrança disparou inesperadamente         | Cost Explorer filtrar por tag `Project`; revisar `aws ec2 describe-instances` (com e sem tag), volumes órfãos, NAT Gateway                             |
| Acesso SSM quebrou (agent offline)        | Verificar Internet egress no SG; reiniciar agent via Console (EC2 → Connect → EC2 Instance Connect — operação que reabre 22 tempo); ver runbook futuro |

---

## Referências cruzadas

- ADR-0008 — pivot Hostinger → AWS EC2 efêmera (origem destes recursos)
- ADR-0009 — substituir SSH por SSM Session Manager (origem do ingress vazio)
- ADR-0010 — AWS como eixo deliberado (motivação de fundo do P0-B5/B6)
- ADR-0011 — Audit baseline (decisões + alternativas da seção "Audit & Compliance")
- ADR-0012 — Permission set `EcommerceProjectAdmin` (decisões + alternativas da seção "IAM Identity Center")
- ADR-0006 — repo público (motiva rigor de tags + Budget + IAM scoping)
- `docs/runbooks/aws-audit-baseline.md` — runbook reproduzível do que está em "Audit & Compliance"
- `docs/runbooks/aws-permission-set-management.md` — runbook reproduzível do `EcommerceProjectAdmin`
- `docs/infra/cloudflare.md` — DNS apontado para o EIP daqui
- `docs/backlog/phase-0.md` P0-B4 e P0-B5 — DoD originais e notas de execução
- PROJECT_BRIEF.md §0.1 (defesa em profundidade), §0.2 (AWS como eixo deliberado),
  §5.4 (caminho de execução com adendo apontando pra ADR-0008), §5.5 (IaC
  Ansible + OpenTofu, expandido pra AWS desde o pivot)
- AWS docs:
  - [EC2 instance types](https://aws.amazon.com/ec2/instance-types/)
  - [EBS volume types](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volume-types.html)
  - [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
  - [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
  - [IAM Identity Center](https://docs.aws.amazon.com/singlesignon/)
  - [CloudTrail security best practices](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/best-practices-security.html)
  - [AWS Config conformance packs](https://docs.aws.amazon.com/config/latest/developerguide/conformance-packs.html)
