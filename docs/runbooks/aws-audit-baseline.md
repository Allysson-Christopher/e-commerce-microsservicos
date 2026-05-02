# Runbook — AWS audit baseline (CloudTrail + Config) do zero

> **Para que serve este runbook:** reproduzir, do zero, o audit baseline
> AWS que sustenta a P0-B5 — bucket S3 dedicado com lifecycle e policies,
> CloudTrail multi-region, AWS Config + conformance pack EC2 + regra
> `required-tags-Project` escopada. Útil pra recriar (se a conta sumir
> ou for fork pra outro projeto), pra auditar, pra onboard.
>
> **Última execução real:** 2026-05-02 — registrada em
> `docs/infra/aws-specs.md` seção "Audit & Compliance".
>
> **Decisões + alternativas descartadas vivem em ADR-0011.** Este runbook
> só cobre o **como** reproduzir.

---

## Pré-requisitos

- Conta AWS acessível via Identity Center (ver `docs/infra/aws-specs.md`).
- Profile SSO ativo: `aws sso login --profile AdministratorAccess-905418198749`
- Permissões: `AdministratorAccess` (ou permission set escopado contendo
  `s3:*`, `cloudtrail:*`, `config:*`, `iam:CreateServiceLinkedRole`).
- `curl` e Python3 disponíveis localmente (template do conformance pack
  vem do GitHub awslabs).

---

## Passo a passo

### 1. Bucket S3 de audit (compartilhado CloudTrail + Config)

#### 1.1. Criar o bucket

```bash
aws s3api create-bucket \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --region us-east-1
```

> Em `us-east-1`, **não** passar `--create-bucket-configuration`. É região
> default da API S3 e o parâmetro causa erro `InvalidLocationConstraint`
> nesta região especificamente.

#### 1.2. Aplicar tags policy

```bash
aws s3api put-bucket-tagging \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --tagging 'TagSet=[
    {Key=Project,Value=ecommerce-microsservicos},
    {Key=Environment,Value=sandbox},
    {Key=ManagedBy,Value=manual},
    {Key=Name,Value=ecommerce-audit-bucket}
  ]'
```

#### 1.3. Bloqueio total de público access

```bash
aws s3api put-public-access-block \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --public-access-block-configuration \
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
```

#### 1.4. Versioning (defesa contra delete)

```bash
aws s3api put-bucket-versioning \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --versioning-configuration Status=Enabled
```

#### 1.5. Encryption SSE-S3

```bash
aws s3api put-bucket-encryption \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
      "BucketKeyEnabled": false
    }]
  }'
```

#### 1.6. Lifecycle (90d Standard → 365d Glacier IR → expirar)

```bash
cat > /tmp/lifecycle.json <<'EOF'
{
  "Rules": [
    {
      "ID": "audit-objects-lifecycle",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transitions": [{"Days": 90, "StorageClass": "GLACIER_IR"}],
      "Expiration": {"Days": 455},
      "NoncurrentVersionTransitions": [{"NoncurrentDays": 90, "StorageClass": "GLACIER_IR"}],
      "NoncurrentVersionExpiration": {"NoncurrentDays": 455},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --lifecycle-configuration file:///tmp/lifecycle.json
```

> AWS adiciona automaticamente `TransitionDefaultMinimumObjectSize: all_storage_classes_128K` —
> objetos < 128 KB pulam Glacier transitions (custo de metadata excede
> economia). Logs CloudTrail/Config são bem maiores; não afeta.

#### 1.7. Bucket policy

```bash
cat > /tmp/bucket-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": {"Service": "cloudtrail.amazonaws.com"},
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudtrail:us-east-1:905418198749:trail/ecommerce-microsservicos-management-trail"
        }
      }
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": {"Service": "cloudtrail.amazonaws.com"},
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749/cloudtrail/AWSLogs/905418198749/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceArn": "arn:aws:cloudtrail:us-east-1:905418198749:trail/ecommerce-microsservicos-management-trail"
        }
      }
    },
    {
      "Sid": "AWSConfigBucketPermissionsCheck",
      "Effect": "Allow",
      "Principal": {"Service": "config.amazonaws.com"},
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749",
      "Condition": {"StringEquals": {"aws:SourceAccount": "905418198749"}}
    },
    {
      "Sid": "AWSConfigBucketExistenceCheck",
      "Effect": "Allow",
      "Principal": {"Service": "config.amazonaws.com"},
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749",
      "Condition": {"StringEquals": {"aws:SourceAccount": "905418198749"}}
    },
    {
      "Sid": "AWSConfigBucketDelivery",
      "Effect": "Allow",
      "Principal": {"Service": "config.amazonaws.com"},
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749/config/AWSLogs/905418198749/Config/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceAccount": "905418198749"
        }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749",
        "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749/*"
      ],
      "Condition": {"Bool": {"aws:SecureTransport": "false"}}
    },
    {
      "Sid": "DenyObjectDeletionByAnyPrincipal",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:DeleteObject", "s3:DeleteObjectVersion"],
      "Resource": "arn:aws:s3:::ecommerce-microsservicos-audit-905418198749/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket ecommerce-microsservicos-audit-905418198749 \
  --policy file:///tmp/bucket-policy.json
```

> **Atenção:** `Deny s3:DeleteObject*` lockia também o admin. Lifecycle
> expiration **continua funcionando** (operação interna do S3 sem IAM
> principal). Pra deletar individualmente em emergência, primeiro
> remover essa statement da policy (operação logada).

---

### 2. CloudTrail trail multi-region

#### 2.1. Criar o trail

```bash
aws cloudtrail create-trail \
  --name ecommerce-microsservicos-management-trail \
  --s3-bucket-name ecommerce-microsservicos-audit-905418198749 \
  --s3-key-prefix cloudtrail \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --tags-list \
    'Key=Project,Value=ecommerce-microsservicos' \
    'Key=Environment,Value=sandbox' \
    'Key=ManagedBy,Value=manual' \
    'Key=Name,Value=ecommerce-management-trail'
```

#### 2.2. Iniciar logging

```bash
aws cloudtrail start-logging \
  --name ecommerce-microsservicos-management-trail
```

#### 2.3. Validar

```bash
aws cloudtrail get-trail-status \
  --name ecommerce-microsservicos-management-trail \
  --query '{IsLogging:IsLogging,LatestDeliveryError:LatestDeliveryError,LatestDeliveryAttemptTime:LatestDeliveryAttemptTime}'

# Esperado: IsLogging=true, LatestDeliveryError=null
# Primeiros objetos em S3 chegam em ~5min; ver:
aws s3 ls s3://ecommerce-microsservicos-audit-905418198749/cloudtrail/AWSLogs/905418198749/ --recursive | head
```

---

### 3. AWS Config

#### 3.1. Service-linked role (idempotente)

```bash
aws iam create-service-linked-role --aws-service-name config.amazonaws.com 2>&1 || true
```

#### 3.2. Configuration recorder

```bash
aws configservice put-configuration-recorder \
  --configuration-recorder '{
    "name": "default",
    "roleARN": "arn:aws:iam::905418198749:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig",
    "recordingGroup": {
      "allSupported": true,
      "includeGlobalResourceTypes": true,
      "recordingStrategy": {"useOnly": "ALL_SUPPORTED_RESOURCE_TYPES"}
    }
  }'
```

#### 3.3. Delivery channel

```bash
aws configservice put-delivery-channel \
  --delivery-channel '{
    "name": "default",
    "s3BucketName": "ecommerce-microsservicos-audit-905418198749",
    "s3KeyPrefix": "config",
    "configSnapshotDeliveryProperties": {"deliveryFrequency": "TwentyFour_Hours"}
  }'
```

#### 3.4. Iniciar recorder

```bash
aws configservice start-configuration-recorder \
  --configuration-recorder-name default
```

#### 3.5. Validar

```bash
aws configservice describe-configuration-recorder-status \
  --query 'ConfigurationRecordersStatus[0].{recording:recording,lastStatus:lastStatus,lastErrorMessage:lastErrorMessage}'

# Esperado: recording=true, lastStatus=PENDING (primeiros minutos) ou SUCCESS
```

---

### 4. Conformance pack `Operational-Best-Practices-for-EC2`

#### 4.1. Baixar template AWS-managed

```bash
curl -fsSL -o /tmp/conformance-pack-ec2.yaml \
  https://raw.githubusercontent.com/awslabs/aws-config-rules/master/aws-config-conformance-packs/Operational-Best-Practices-for-EC2.yaml
```

> **Fonte:** repo público AWS labs `awslabs/aws-config-rules`. Filename
> exato: **`Operational-Best-Practices-for-EC2.yaml`** (sem prefixo `Amazon-`
> que aparece em alguns mirrors). Branch: `master`.
> Tamanho aproximado: 8 KB / 275 linhas. Cobre ~10 regras EC2 best practices
> (`ec2-imdsv2-check`, `restricted-ssh`, `incoming-ssh-disabled`,
> `instance-managed-by-systems-manager`, `ec2-volume-inuse-check`, etc).

#### 4.2. Aplicar

```bash
aws configservice put-conformance-pack \
  --conformance-pack-name ecommerce-OBP-EC2 \
  --template-body file:///tmp/conformance-pack-ec2.yaml
```

#### 4.3. Validar (paciência: primeiros 30-60 min são INSUFFICIENT_DATA)

```bash
aws configservice describe-conformance-packs \
  --query 'ConformancePackDetails[].{Name:ConformancePackName,Arn:ConformancePackArn}'

aws configservice get-conformance-pack-compliance-summary \
  --conformance-pack-names ecommerce-OBP-EC2
```

---

### 5. Regra `required-tags-Project` (escopada)

```bash
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "required-tags-Project",
    "Description": "Recursos AWS do projeto devem ter a tag Project (ADR-0008 tags policy). Scope limitado a resource types onde o projeto cria recursos.",
    "Scope": {
      "ComplianceResourceTypes": [
        "AWS::EC2::Instance",
        "AWS::EC2::Volume",
        "AWS::EC2::SecurityGroup",
        "AWS::EC2::NetworkInterface",
        "AWS::EC2::EIP",
        "AWS::IAM::Role",
        "AWS::CloudTrail::Trail"
      ]
    },
    "Source": {
      "Owner": "AWS",
      "SourceIdentifier": "REQUIRED_TAGS"
    },
    "InputParameters": "{\"tag1Key\":\"Project\",\"tag1Value\":\"ecommerce-microsservicos\"}"
  }'
```

> **Por que escopo limitado:** primeira aplicação sem `Scope` capturou 26
> recursos NON_COMPLIANT, dos quais 20 eram **legacy de outros projetos
> pessoais na mesma conta** (buckets S3, ACM certs, default VPC). A
> regra estava correta — só não tinha contexto sobre quais resource
> types o projeto efetivamente cria. Lista atual cobre EC2/EBS/SG/NIC/EIP/
> IAM/CloudTrail (tipos que o projeto provisiona). S3 buckets do projeto
> futuro vão exigir custom rule (Lambda) com filtro de nome — fica para
> Phase 1 quando o primeiro bucket de dados nascer.

#### 5.1. Disparar re-evaluation imediata

```bash
aws configservice delete-evaluation-results --config-rule-name required-tags-Project
aws configservice start-config-rules-evaluation --config-rule-names required-tags-Project
```

> A primeira chamada limpa evaluations antigas (caso o scope tenha sido
> mudado depois da criação). A segunda dispara re-evaluation imediata.
> Sem isso, evaluations stale continuam aparecendo via
> `get-compliance-details-by-config-rule`.

#### 5.2. Validar

```bash
aws configservice describe-compliance-by-config-rule \
  --config-rule-names required-tags-Project \
  --query 'ComplianceByConfigRules[0]'

aws configservice get-compliance-details-by-config-rule \
  --config-rule-name required-tags-Project \
  --query 'EvaluationResults[].{Resource:EvaluationResultIdentifier.EvaluationResultQualifier.ResourceId,Type:EvaluationResultIdentifier.EvaluationResultQualifier.ResourceType,Compliant:ComplianceType}'
```

NON_COMPLIANT esperados (estado em 2026-05-02, conta solo Phase 0):

- 4 do projeto: EC2 `i-072708...`, NIC `eni-03b0...`, SG `sg-06f620...`, Root EBS `vol-03f0...`
- 2 SGs default da VPC default AWS (`sg-0552b...`, `sg-08e5a...`) — irredutíveis sem deletar a default VPC.

COMPLIANT esperados:

- IAM Role `EcommerceEC2SSMRole` (já tem tag `Project`)
- EIP `eipalloc-03c82731695e04b80` (já tem tags completas)
- Trail `arn:aws:cloudtrail:us-east-1:905418198749:trail/ecommerce-microsservicos-management-trail` (criado nesta sessão com tags)

---

## Recovery — situações onde voltar aqui

| Situação                                                | Pular para                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Conta AWS comprometida — recriar do zero                | Passo 1                                                                                        |
| Bucket de audit acidentalmente deletado                 | Passo 1; recriar trail (passo 2) e Config delivery channel (3.3)                               |
| Trail parou de logar                                    | `aws cloudtrail get-trail-status`; ver `LatestDeliveryError`; checar bucket policy             |
| Conformance pack mostrar erro                           | `aws configservice describe-conformance-pack-status`; recriar via 4.2 se `STATE=CREATE_FAILED` |
| Regra `required-tags-Project` não avalia novos recursos | Passo 5.1 (delete-evaluation-results + start-config-rules-evaluation)                          |
| Adicionar resource type ao scope da rule                | Passo 5 (re-rodar `put-config-rule` com lista atualizada)                                      |
| Custo do bucket subir inesperadamente                   | Cost Explorer filtrar por `Project=ecommerce-microsservicos`; checar lifecycle aplicada        |

---

## Próximas tarefas que dependem desta

- **P0-D1** — OpenTofu vai importar bucket, trail, recorder, delivery
  channel, conformance pack e regra pra state IaC. Tag `ManagedBy`
  muda de `manual` pra `terraform` no PR de import.
- **P0-B6** — Escopar permission set IAM Identity Center.
  Pré-requisito ideal: P0-B5 já em produção pra que a primeira ação
  fora-do-escopo (caso aconteça) seja capturada por CloudTrail.
- **Phase 1** — quando primeiro bucket de dados do projeto nascer
  (backups Postgres, uploads de cliente, etc.), considerar:
  (i) ativar **data events** no CloudTrail pra esse bucket; (ii) criar
  **custom rule** com Lambda pra avaliar tags em buckets do projeto
  (filtro de nome); (iii) revisitar `Operational-Best-Practices-for-S3`
  como conformance pack adicional.
- **Phase 4** (Segurança aprofundada) — considerar AWS Security Hub
  pra agregação multi-source, Audit Manager se requisito de compliance
  formal aparecer, e ativar **Insights** no CloudTrail quando volume
  de chamadas tiver baseline estável.

---

## Referências

- **ADR-0011** (decisões + alternativas; este runbook é o "como")
- **ADR-0010** (AWS como eixo deliberado — motivação de fundo)
- ADR-0008 (tag policy que `required-tags-Project` valida)
- ADR-0009 (SSM Session Manager — relevante pro `restricted-ssh` do conformance pack)
- `docs/infra/aws-specs.md` seção "Audit & Compliance" — estado declarativo atual
- `docs/backlog/phase-0.md` P0-B5 (DoD original)
- AWS docs: [CloudTrail security best practices](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/best-practices-security.html), [AWS Config conformance packs](https://docs.aws.amazon.com/config/latest/developerguide/conformance-packs.html), [REQUIRED_TAGS rule](https://docs.aws.amazon.com/config/latest/developerguide/required-tags.html)
- [awslabs/aws-config-rules — conformance pack templates](https://github.com/awslabs/aws-config-rules/tree/master/aws-config-conformance-packs)
