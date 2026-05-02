# Runbook — Permission set `EcommerceProjectAdmin` (criar / atualizar / break-glass / debugar)

> **Para que serve este runbook:** reproduzir, do zero, o permission set
> `EcommerceProjectAdmin` que sustenta o uso cotidiano da conta AWS do
> projeto (P0-B6 / ADR-0012). Cobre também atualização da policy quando
> ela precisar de ajuste, procedimento de break-glass, e debug de
> `AccessDenied` esperado vs inesperado.
>
> **Última execução real:** 2026-05-02 — registrada em
> `docs/infra/aws-specs.md` seção "IAM Identity Center".
>
> **Decisões + alternativas descartadas vivem em ADR-0012.** Este runbook
> só cobre o **como** reproduzir e operar.

---

## Pré-requisitos

- Conta AWS acessível via Identity Center (ver `docs/infra/aws-specs.md`).
- Profile SSO ativo com `AdministratorAccess` pra criar o novo permission
  set: `aws sso login --profile AdministratorAccess-905418198749`
- IAM Access Analyzer disponível (`aws accessanalyzer validate-policy`)
  na região `us-east-1` — não exige setup, é managed.
- `python3` + `jq` (opcional) pra validar JSON local.

---

## Identificadores fixos da conta

| Campo                  | Valor                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| Account ID             | `905418198749`                                                            |
| Region                 | `us-east-1` (Identity Center home, fixa)                                  |
| SSO instance ARN       | `arn:aws:sso:::instance/ssoins-72230cf4411d9bf7`                          |
| Identity Store ID      | `d-9067e0b68e`                                                            |
| User `allysson` UserId | `442824d8-4071-701c-c764-3520d57bd5f5`                                    |
| Permission set ARN     | `arn:aws:sso:::permissionSet/ssoins-72230cf4411d9bf7/ps-8b8093cc7c6e9d61` |

> Se a conta sumir e for recriada, esses IDs mudam. Re-rodar o passo de
> descoberta abaixo pra capturar os novos.

---

## Passo a passo — criar o permission set do zero

### 1. Descoberta de IDs

```bash
# Identity Center instance
aws sso-admin list-instances \
  --query 'Instances[0].[InstanceArn,IdentityStoreId]' --output text

# UserId do humano operador
aws identitystore list-users \
  --identity-store-id d-9067e0b68e \
  --query 'Users[?UserName==`allysson`].UserId' --output text
```

### 2. Validar a policy localmente antes de aplicar

```bash
# Sintaxe JSON
python3 -m json.tool /path/to/EcommerceProjectAdminPolicy.json > /dev/null

# Validação semântica via IAM Access Analyzer
aws accessanalyzer validate-policy \
  --policy-document file:///path/to/EcommerceProjectAdminPolicy.json \
  --policy-type IDENTITY_POLICY \
  --query 'findings[?findingType==`ERROR` || findingType==`SECURITY_WARNING`]' \
  --output json
```

> **Gate de qualidade:** `findings` com `ERROR` ou `SECURITY_WARNING`
> bloqueiam o apply. `SUGGESTION` é cosmético — avaliar caso a caso
> (ex.: `REDUNDANT_ACTION` sobre `logs:GetQueryResults` foi aceito como
> falso positivo do validador).

### 3. Criar permission set + inline policy

```bash
SSO_INSTANCE_ARN="arn:aws:sso:::instance/ssoins-72230cf4411d9bf7"

PS_ARN=$(aws sso-admin create-permission-set \
  --instance-arn "$SSO_INSTANCE_ARN" \
  --name "EcommerceProjectAdmin" \
  --description "Default permission set for ecommerce-microsservicos. See ADR-0012." \
  --session-duration "PT8H" \
  --tags Key=Project,Value=ecommerce-microsservicos \
         Key=Environment,Value=sandbox \
         Key=ManagedBy,Value=manual \
  --query 'PermissionSet.PermissionSetArn' --output text)
echo "PS_ARN=$PS_ARN"

aws sso-admin put-inline-policy-to-permission-set \
  --instance-arn "$SSO_INSTANCE_ARN" \
  --permission-set-arn "$PS_ARN" \
  --inline-policy file:///path/to/EcommerceProjectAdminPolicy.json
```

### 4. Atribuir ao usuário (provisiona implicitamente)

```bash
USER_ID="442824d8-4071-701c-c764-3520d57bd5f5"

REQ=$(aws sso-admin create-account-assignment \
  --instance-arn "$SSO_INSTANCE_ARN" \
  --target-type AWS_ACCOUNT \
  --target-id 905418198749 \
  --permission-set-arn "$PS_ARN" \
  --principal-type USER \
  --principal-id "$USER_ID" \
  --query 'AccountAssignmentCreationStatus.RequestId' --output text)

# Polling
for i in 1 2 3 4 5; do
  STATUS=$(aws sso-admin describe-account-assignment-creation-status \
    --instance-arn "$SSO_INSTANCE_ARN" \
    --account-assignment-creation-request-id "$REQ" \
    --query 'AccountAssignmentCreationStatus.Status' --output text)
  echo "[$i] $STATUS"
  [ "$STATUS" = "SUCCEEDED" ] && break
  [ "$STATUS" = "FAILED" ] && break
  sleep 3
done
```

> **Pegadinha:** `aws sso-admin provision-permission-set` retorna
> `404 — Permission set provision not found` se você chamar **antes**
> de existir um assignment na conta. A primeira provision é implícita
> via `create-account-assignment`. `provision-permission-set` só serve
> pra **re-provisionar** depois de update da policy (passo 6).

### 5. Configurar profile local

Editar `~/.aws/config` adicionando:

```ini
[profile EcommerceProjectAdmin-905418198749]
sso_session = allysson
sso_account_id = 905418198749
sso_role_name = EcommerceProjectAdmin
region = us-east-1
output = json
```

Testar (token SSO existente da sessão `allysson` é reaproveitado — sem
novo login):

```bash
aws sts get-caller-identity --profile EcommerceProjectAdmin-905418198749
# Esperado: arn:aws:sts::905418198749:assumed-role/AWSReservedSSO_EcommerceProjectAdmin_<hash>/allysson
```

Se quiser deixar como default da shell:

```bash
export AWS_PROFILE=EcommerceProjectAdmin-905418198749
```

### 6. Suite de validação (esperados confirmados na primeira execução)

```bash
PROF=EcommerceProjectAdmin-905418198749

# Leitura ampla — esperado: 200 / lista
aws --profile $PROF s3 ls
aws --profile $PROF ec2 describe-instances
aws --profile $PROF cloudtrail get-trail-status \
  --name ecommerce-microsservicos-management-trail
aws --profile $PROF budgets describe-budget \
  --account-id 905418198749 \
  --budget-name ecommerce-microsservicos-monthly-30usd

# Recurso do projeto (tag-based) — esperado: 200
aws --profile $PROF s3api get-bucket-tagging \
  --bucket ecommerce-microsservicos-audit-905418198749

# Recurso legacy fora do projeto — esperado: AccessDenied
aws --profile $PROF s3api get-bucket-acl --bucket <um-bucket-legacy>

# Operação proibida (Layer5 explicit Deny) — esperado: AccessDenied "explicit deny"
aws --profile $PROF iam create-user --user-name test-deny
aws --profile $PROF organizations describe-organization

# SSM Session Manager — esperado: PingStatus=Online
aws --profile $PROF ssm describe-instance-information \
  --filters Key=InstanceIds,Values=i-072708190abd3d102

# Backfill de tags em recurso em gap (#1/#2/#3) — esperado: 200 (dry-run "would have succeeded")
aws --profile $PROF ec2 create-tags \
  --resources i-072708190abd3d102 \
  --tags Key=Project,Value=ecommerce-microsservicos \
  --dry-run
```

---

## Atualizar a policy (sem recriar permission set)

Quando ADR específica adicionar Allow blocks (Phase 2 / serviço novo) ou
quando descobrir gap real durante uso:

```bash
# 1. Editar JSON localmente
$EDITOR EcommerceProjectAdminPolicy.json

# 2. Validar
aws accessanalyzer validate-policy \
  --policy-document file://EcommerceProjectAdminPolicy.json \
  --policy-type IDENTITY_POLICY \
  --query 'findings[?findingType==`ERROR` || findingType==`SECURITY_WARNING`]'

# 3. Atualizar inline policy (substitui inteira)
aws sso-admin put-inline-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-72230cf4411d9bf7 \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-72230cf4411d9bf7/ps-8b8093cc7c6e9d61 \
  --inline-policy file://EcommerceProjectAdminPolicy.json

# 4. Re-provisionar pra propagar a mudança às sessões ativas
aws sso-admin provision-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-72230cf4411d9bf7 \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-72230cf4411d9bf7/ps-8b8093cc7c6e9d61 \
  --target-type AWS_ACCOUNT \
  --target-id 905418198749

# 5. Sessões SSO existentes precisam de re-login pra pegar policy nova
aws sso logout
aws sso login --profile EcommerceProjectAdmin-905418198749
```

> **Imutabilidade da ADR:** mudança que altera intenção (não só
> implementação) exige nova ADR `Supersedes: ADR-0012`. Adicionar Allow
> pra serviço novo geralmente é "estende a decisão", não "muda" — cabe
> num PR sem nova ADR, citando ADR-0012 no body.

---

## Break-glass — usar `AdministratorAccess`

**Quando usar:**

- `EcommerceProjectAdmin` recusa fluxo legítimo e ajustar a policy
  agora não é viável.
- Operação fora do escopo do projeto (mexer em recurso legacy pessoal,
  criar permission set novo, alterar billing).

**Procedimento:**

```bash
# 1. Login no profile broad
aws sso login --profile AdministratorAccess-905418198749
export AWS_PROFILE=AdministratorAccess-905418198749

# 2. Fazer SÓ a operação mínima que destrava
aws <operacao-especifica>

# 3. Voltar pro default
export AWS_PROFILE=EcommerceProjectAdmin-905418198749
```

**Auditoria do break-glass:**

```bash
# Ver últimas trocas de role pelo principal allysson
aws cloudtrail lookup-events \
  --lookup-attributes \
    AttributeKey=Username,AttributeValue=allysson \
  --max-items 30 \
  --query 'Events[?EventName==`AssumeRoleWithSAML` || EventName==`Federate`].[EventTime,EventName,Username]' \
  --output table
```

> Cada uso de break-glass gera registro CloudTrail. Em revisão de
> Phase 0 / Grupo H, considerar EventBridge rule disparando
> notification (Slack/email) na primeira ação via `AdministratorAccess`
> dentro de janela de N minutos — TODO documentado em ADR-0012.

---

## Debug — `AccessDenied` recebido

### 1. Identificar a categoria

```
"is not authorized to perform: <action> ... because no identity-based policy allows..."
  → AccessDenied implícito (action não está em nenhum Allow). Caso 99% — falta cobertura na policy.

"with an explicit deny in an identity-based policy"
  → Caso 1%. Layer5 (Deny defensivo) bateu. Confirmar que NÃO é uma das ações intencionalmente proibidas
    (CreateUser, DeleteRole, organizations:*, sso:Update*PermissionSet, etc).

"UnauthorizedOperation" (EC2)
  → Equivalente a "no identity-based policy allows" pra ações EC2 com formato de erro próprio.
```

### 2. Decodificar mensagem cifrada (EC2/ELB)

EC2 anexa `Encoded authorization failure message` em alguns AccessDenied.
Decodificar pra ver qual condition/principal/resource bateu:

```bash
aws sts decode-authorization-message \
  --encoded-message "<string-cifrada>" \
  --query 'DecodedMessage' --output text | python3 -m json.tool
```

(Decode exige `sts:DecodeAuthorizationMessage` — incluído na leitura
ampla da policy.)

### 3. Casos esperados (não são bug)

- **EC2 `i-072708190abd3d102` mutativo (Stop/Start/Reboot/Terminate)** sem
  tag `Project` → `AccessDenied`. **Resolução:** aplicar tag via
  `aws ec2 create-tags` (já permitido pelo statement
  `Layer4BackfillTagsOnGappedResources`); depois retentar.
- **Bucket S3 legacy fora do projeto** (`kitsepecas`, `site-upload`,
  etc) → `AccessDenied`. Comportamento intencional de defesa contra
  erros operacionais.
- **`iam:CreateUser` / `iam:DeleteRole` / `organizations:*` / `kms:DisableKey`**
  → `explicit deny`. Layer5. Sair do permission set se for legítimo
  (break-glass).

### 4. Casos suspeitos (provável gap real)

- **Service novo da AWS** (RDS, ElastiCache, Secrets Manager, X-Ray,
  Cognito, SES, Lambda, ECR, EKS) → `AccessDenied` sem cobertura. ADR
  específica de Phase 2 / migração tem que carregar update de policy
  (estende ADR-0012, geralmente sem supersede).
- **Action de leitura básica (`Describe*`/`List*`/`Get*`) recusada** →
  bug na policy. Adicionar à Layer1 e re-aplicar (passo "Atualizar
  policy" acima).

### 5. Simular a policy contra um caso específico

```bash
aws iam simulate-custom-policy \
  --policy-input-list "$(cat /path/to/EcommerceProjectAdminPolicy.json)" \
  --action-names "ec2:StopInstances" \
  --resource-arns "arn:aws:ec2:us-east-1:905418198749:instance/i-072708190abd3d102" \
  --resource-policy "$(aws iam get-role --role-name <role> --query Role.AssumeRolePolicyDocument --output json)" \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision,MatchedStatements[].SourcePolicyType]'
```

(Útil pra testar mudança de policy antes de aplicar.)

---

## Recovery — situações onde voltar aqui

| Situação                                                | Pular para                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Conta AWS recriada / IDs mudaram                        | Passo 1 (Descoberta) + atualizar `aws-specs.md`                         |
| Policy precisa update (serviço novo, gap real)          | "Atualizar a policy"                                                    |
| Permission set acidentalmente apagado                   | Passo 3 + 4. Layer5 deveria ter bloqueado — investigar como aconteceu   |
| Lockout total (sem profile broad nem ProjAdmin)         | Login via root + MFA hardware → recriar permission set via console      |
| `EcommerceProjectAdmin` recusa fluxo crítico no momento | Break-glass em `AdministratorAccess` + abrir TODO no `aws-specs.md` #5+ |
| Suspeita de uso indevido do break-glass                 | CloudTrail `lookup-events` filtrando `EventName=AssumeRoleWithSAML`     |
| Inline policy passou de 32768 chars                     | Refatorar em managed customer policy + attach (não inline)              |

---

## Próximas tarefas que dependem desta

- **PR pré-D1 (cleanup)** — aplicar tags em EC2/Root EBS/SG/NIC (gaps
  #1/#2/#3 do `aws-specs.md`), agora possível direto pelo
  `EcommerceProjectAdmin`. Quando todos os gaps fecharem, ADR de
  revisão pode reapertar `ssm:StartSession` com tag-based.
- **P0-D1** — não importa o permission set pra OpenTofu por decisão
  prévia (`aws-specs.md` linha "Identity Center user/permission set
  ficam fora"). Se mudar, vira ADR específica.
- **Phase 2 — toda ADR de migração AWS-native** (RDS, ElastiCache,
  Secrets Manager, X-Ray, SES, Cognito) carrega responsabilidade
  de propor update de policy do `EcommerceProjectAdmin`.
- **Grupo H / Phase 4** — EventBridge rule alarmando uso de
  `AdministratorAccess` (break-glass), session recording detalhado
  no SSM, IAM Access Analyzer external access findings sweep.

---

## Referências

- **ADR-0012** (decisões + alternativas; este runbook é o "como")
- **ADR-0010** (AWS como eixo deliberado — motivação de fundo)
- **ADR-0009** (SSM Session Manager — exceção sem condition de tag)
- **ADR-0008** (tags policy que `aws:RequestTag`/`aws:ResourceTag` enforça)
- `docs/infra/aws-specs.md` seção "IAM Identity Center" — estado declarativo atual
- `docs/backlog/phase-0.md` P0-B6 (DoD original)
- AWS docs:
  - [IAM Identity Center — Permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html)
  - [Inline policies vs managed policies for permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetcustom.html)
  - [`aws:ResourceTag` global condition key](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-resourcetag)
  - [`aws:RequestTag` and `aws:TagKeys`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-requesttag)
  - [Service authorization reference (per-service action support for tags)](https://docs.aws.amazon.com/service-authorization/latest/reference/reference.html)
  - [IAM Access Analyzer — Validate policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html)
  - [IAM policy simulator](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
- AWS CLI:
  - [`sso-admin` reference](https://docs.aws.amazon.com/cli/latest/reference/sso-admin/)
  - [`identitystore` reference](https://docs.aws.amazon.com/cli/latest/reference/identitystore/)
  - [`accessanalyzer validate-policy`](https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/validate-policy.html)
