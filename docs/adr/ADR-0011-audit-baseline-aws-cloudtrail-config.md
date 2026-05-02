# ADR-0011 — Audit baseline AWS via CloudTrail management-only + AWS Config minimal com `required-tags` escopada

- **Status:** accepted
- **Data:** 2026-05-02
- **Decisores:** Allysson Christopher
- **Tags:** infra, security, devsecops, audit, aws, compliance, learning-trade-off

## Contexto

A **ADR-0010** declarou AWS como eixo deliberado de aprendizado e introduziu
no backlog **P0-B5** (CloudTrail + AWS Config baseline) como tarefa que
materializa o princípio com baixo custo. Esta ADR fixa o **escopo concreto**
da P0-B5 — quais eventos, quanto tempo guardar, onde criptografar, qual
rule de Config criar — registrando as alternativas reais consideradas em
cada decisão.

`docs/infra/aws-specs.md` (criado em P0-B4, 2026-05-02) já listava 5
follow-ups conhecidos com severidade (encryption do root, gaps de tags
em EC2/SG/EBS, permission set broad). Esta ADR endereça parcialmente os
4 primeiros via mecanismo automatizado de detecção (Config rule), em vez
de exigir disciplina manual.

Forças em jogo:

- **Custo controlado.** Budget atual é $30/mês. CloudTrail management
  events em primeiro trail são gratuitos; AWS Config tem custo
  pay-per-use ($0.003/CI gravado + $0.001/evaluation).
- **Conta solo educacional.** Sem requisito de compliance externo;
  audit trail vale por aprendizado + defesa contra erros operacionais
  do próprio dev.
- **Conta compartilhada com legacy.** A conta `905418198749` tem
  recursos pré-existentes não relacionados ao projeto (7 buckets S3
  legacy, 2 ACM certs, default VPC com 6 subnets/3 SGs/IGW/NACL).
  Qualquer regra global de compliance vai capturar esses recursos —
  gera noise se não escopar.
- **Reversibilidade.** Cada decisão aqui é fácil de mudar depois
  (toggle data events, expandir scope da rule, ativar Insights). Não
  estamos pintando em canto.

A pergunta de design: **qual o conjunto mínimo de telemetria de
auditoria que dá sinal útil sem virar sobrecusto, sobrenoise, ou
compromisso com ferramentas pagas que não vamos usar?**

## Decisão

**Audit baseline da conta AWS é configurada com:**

- **CloudTrail multi-region trail `ecommerce-microsservicos-management-trail`** —
  apenas management events (read+write); sem data events; sem Insights;
  log file validation enabled (digest assinado por hora).
- **S3 bucket dedicado `ecommerce-microsservicos-audit-905418198749`** —
  SSE-S3 (AES-256 gerenciado pelo S3), versioning enabled, public access
  block total, lifecycle 90 dias Standard → 365 dias Glacier IR →
  expirar (455 dias totais), bucket policy que (i) permite só CloudTrail
  e Config escreverem nos prefixos respectivos, (ii) nega request sem
  TLS, (iii) nega `s3:DeleteObject*` por qualquer principal.
- **AWS Config recorder `default`** com `allSupported=true` +
  `includeGlobalResourceTypes=true`, delivery channel diário pra prefix
  `config/` do bucket de audit.
- **Conformance pack `ecommerce-OBP-EC2`** — template AWS-managed
  `Operational-Best-Practices-for-EC2.yaml` aplicado sem customizações.
- **Regra `required-tags-Project`** managed (`SourceIdentifier=REQUIRED_TAGS`)
  com escopo limitado a 7 resource types onde o projeto efetivamente
  cria recursos: EC2 Instance, EBS Volume, Security Group, NetworkInterface,
  EIP, IAM Role, CloudTrail Trail.

### Detalhe das 4 escolhas técnicas

**1. CloudTrail: apenas management events (descartado data + Insights).**

| Categoria         | Custo                 | Decisão                                                      |
| ----------------- | --------------------- | ------------------------------------------------------------ |
| Management events | $0 (1º trail free)    | **Incluir**                                                  |
| Data events       | $0.10 / 100k events   | **Excluir** — não temos S3/Lambda com volume real ainda      |
| Insights          | $0.35 / 100k analyzed | **Excluir** — sem baseline em conta nova vira alarme ruidoso |

Data events serão revisitados quando Phase 1 entrar (primeiro bucket de
backups Postgres, primeira Lambda). Insights revisitado quando volume
de chamadas API chegar a centenas/dia consistentes.

**2. Lifecycle S3: 90 Standard → 365 Glacier IR → expirar (descartado 30d e 7y).**

| Pattern                                            | Custo total estimado em 1 ano | Decisão                                                                 |
| -------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| 30d Standard → expirar                             | ~$0.05                        | Descartado: perde rastro >1 mês                                         |
| **90d Std → 365d Glacier IR → expire (escolhido)** | **~$0.10-0.20**               | Cobre janela típica de auditoria reativa, exercita transição S3→Glacier |
| 90d Std → 7y Glacier Flexible → expire             | ~$0.50-1.00                   | Descartado: compliance-shaped sem requisito real                        |

Glacier Instant Retrieval (~$0.004/GB/mês) é 5x mais barato que Standard
sem latência de retrieve — tier ideal para dados raramente acessados mas
ocasionalmente necessários (auditoria reativa).

**3. Encryption: SSE-S3 (descartado SSE-KMS managed e CMK customer).**

| Opção                                        | Custo                               | Decisão                                                                                                                                          |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SSE-S3 (AES-256, S3 managed) (escolhido)** | $0                                  | Default secure, zero fricção                                                                                                                     |
| SSE-KMS (chave AWS managed `aws/s3`)         | $0 + log noise (KMS Decrypt events) | Descartado: ganho marginal em projeto educacional sem requisito de chave separável                                                               |
| SSE-KMS com CMK customer                     | ~$1-2/mês + KMS request fees        | Adiada: vira ADR específica de "encryption strategy" se Phase 1+ exigir KMS por outros motivos (Secrets Manager, RDS encryption, EBS encryption) |

CMK customer foi explicitamente cogitada como exercício didático AWS-native
(materializa ADR-0010), mas o overhead de gerenciar uma KMS key dedicada
só pra audit bucket não justifica isolado. Se uma KMS key entrar por
outro motivo, podemos retroativamente migrar o audit bucket pra ela.

**4. AWS Config: básico + 1 conformance pack EC2 + `required-tags` escopada (descartado config-off, config completo, config sem pack).**

| Opção                                                  | Custo estimado  | Decisão                                                                         |
| ------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------- |
| Config off agora                                       | $0              | Descartado: perde drift detection automatizado dos follow-ups do `aws-specs.md` |
| **Básico (allSupported + 1 pack EC2 + required-tags)** | ~$0.30-1/mês    | **Escolhido**                                                                   |
| Minimal (só `required-tags` + 2-3 regras manuais)      | ~$0.10-0.30/mês | Descartado: perde feature didática de conformance pack                          |
| Completo (multi-pack EC2+S3+IAM+Networking)            | ~$1-3/mês       | Descartado: alarme alto demais em Phase 0 com legacy ainda na conta             |

**Decisão de escopo da `required-tags-Project`:** primeira aplicação da
regra (sem scope) capturou **26 NON_COMPLIANT**, dos quais 20 eram
recursos legacy da conta não relacionados ao projeto. Aplicar
`Scope.ComplianceResourceTypes` reduziu pra 6 NON_COMPLIANT (4 do projeto

- 2 SGs default da VPC default — irredutíveis). Trade-off: buckets S3 do
  projeto futuro **não** ficam automaticamente sob avaliação dessa regra.
  Cobertura via custom rule (Lambda) com filtro de nome ficaria pra Phase
  1 quando o primeiro bucket de dados do projeto nascer.

## Consequências

**Positivas:**

- **Audit trail funcional desde dia 1.** Toda chamada de API que modifica
  recursos da conta agora fica em S3 com integridade validável (digest
  CloudTrail), retida por 455 dias.
- **Drift detection automatizado dos gaps do P0-B4.** EC2/SG/Root
  EBS sem tags `Project` viram NON_COMPLIANT visível no Config dashboard
  — passamos de "follow-up no doc" pra "alarme estruturado".
- **Conformance pack EC2 ativo.** ~10 best-practices da AWS avaliadas
  sem customização — IMDSv2 já passa, `restricted-ssh` já passa
  (ADR-0009), `instance-managed-by-systems-manager` deve passar.
- **Custo total ínfimo.** Estimativa < $1/mês em conta solo Phase 0;
  cabe folgado no Budget de $30.
- **Bucket policy com defesa em camadas.** Defense in depth contra
  delete acidental dos próprios audit logs (`Deny s3:DeleteObject*`),
  e contra qualquer outro CloudTrail trail da conta tentar usar
  esse bucket (`aws:SourceArn` lock no trail nosso).
- **Materializa ADR-0010 com baixo investimento.** Primeira tarefa
  pós-ADR-0010 que de fato exercita serviços AWS-native (CloudTrail,
  Config, S3 lifecycle, KMS-adjacent encryption) sem esperar Phase 2.
- **Pré-requisito futuro pra qualquer ADR de compliance** (SOC 2,
  LGPD, PCI). Audit trail centralizado existe — quando Phase 4
  (Segurança aprofundada e pentest) entrar, base já está pronta.

**Negativas / trade-offs aceitos:**

- **Data events ausentes.** Se Phase 1 trouxer S3 com leituras/escritas
  sensíveis (ex.: bucket de uploads de cliente, bucket de backup
  Postgres), não saberemos quem leu/escreveu cada objeto até ativar
  data events (revisão necessária). Mitigação: linha no ADR-0010
  e P0-B5 docs notando que data events virão.
- **Insights ausentes.** Anomalias em padrão de API (ex.: surge súbito
  em `iam:DeleteRole`) não geram alerta automático até ativar Insights.
  Aceito porque conta nova não tem baseline.
- **Conformance pack EC2 vai gerar NON_COMPLIANT em recursos legacy
  fora do projeto** — ACM certs, default VPC subnets, etc. Mesmo
  problema da regra `required-tags`. Aceito como noise inicial; pode
  ser limpo em PR de cleanup futuro (ADR pode escopar pack pra resource
  types se virar fricção).
- **2 SGs default da VPC default são NON_COMPLIANT permanentes.**
  AWS default VPC nasce sem tags; aplicar tag manual seria fraude
  (esses SGs não são "do projeto"). Aceito como noise irredutível.
- **CMK não usada.** Não exercitamos KMS customer-managed nesta tarefa.
  Será exercitada em ADR específica se entrar em Phase 1+.
- **Bucket policy `Deny DeleteObject` lockia o próprio admin.** Se
  futuramente precisarmos apagar um log específico (ex.: dump
  acidentalmente sensível), preciso primeiro atualizar a policy
  (operação reversível, logada em CloudTrail). Aceito como defense
  in depth — o atrito é o ponto.

**Neutras / a observar:**

- **Lifecycle Glacier IR transition em 90d** — primeiros objetos
  transicionam em **2026-07-31**. Verificar custo real após transição
  no Cost Explorer.
- **Conformance pack INSUFFICIENT_DATA inicialmente** — normal nos
  primeiros 30-60 minutos enquanto Config avalia recursos. Vira
  COMPLIANT/NON_COMPLIANT depois.
- **Recursos AWS criados nesta sessão (ManagedBy=manual):**
  - S3 bucket `ecommerce-microsservicos-audit-905418198749`
  - CloudTrail trail `ecommerce-microsservicos-management-trail` (ARN
    `arn:aws:cloudtrail:us-east-1:905418198749:trail/...`)
  - Config recorder `default` + delivery channel `default` + service-linked
    role `AWSServiceRoleForConfig`
  - Conformance pack `ecommerce-OBP-EC2`
  - Config rule `required-tags-Project` (escopada)

  Todos entrarão em state OpenTofu em P0-D1 (`tofu import`).

## Alternativas consideradas

- **CloudTrail apenas o event history default (90d retidos no console
  sem trail dedicado)** — descartada. Não cobre 1 ano de auditoria
  reativa, sem digest assinado, sem visibilidade externa via S3
  query/Athena. Trail dedicado é o pattern básico de qualquer audit
  baseline AWS.
- **Trail single-region em `us-east-1`** — descartada. IAM/STS/CloudFront
  são serviços globais que aparecem em `us-east-1` por convenção, mas
  se eu provisionar algo em `sa-east-1` ou outra region acidentalmente,
  multi-region pega; single-region não. Custo zero adicional pra ir
  multi-region.
- **AWS Security Hub em vez de Config + conformance pack** — adiada.
  Security Hub agrega Config + Inspector + GuardDuty + Macie em um único
  dashboard. Útil em escala; pago por finding (~$3/mês mínimo). Para
  Phase 0, Config sozinho dá ~80% do valor (drift detection, conformance
  pack). Security Hub vira ADR específica em Phase 4 (Segurança aprofundada).
- **AWS Audit Manager** — descartada. Foco em compliance frameworks
  (SOC 2, PCI, HIPAA) com evidence collection automatizado. Pago. Não
  temos requisito de compliance formal hoje. Revisitar quando Phase 4
  trouxer pentest profissional ou se o projeto evoluir pra contexto
  comercial.
- **Bucket único Config-only e bucket separado CloudTrail-only** —
  descartada. Dois buckets dobram surface area (duas policies, duas
  lifecycle policies, dois pontos de monitoring). Bucket único com
  prefixos separados é o pattern recomendado pela AWS para projetos
  pequenos.

## Referências

- `PROJECT_BRIEF.md` §0.1 (defesa em profundidade, auditoria), §0.2
  (AWS como eixo deliberado — adendo de ADR-0010), §6.3 (DevSecOps —
  Config + CloudTrail são alicerce)
- ADR-0008 (pivot AWS EC2 — fonte da tag policy que `required-tags`
  agora valida automaticamente)
- ADR-0009 (SSM Session Manager — `restricted-ssh` do conformance pack
  EC2 deve passar como consequência)
- ADR-0010 (AWS como eixo deliberado — esta ADR é a primeira
  materialização pós-princípio)
- `docs/runbooks/aws-audit-baseline.md` — runbook reproduzível de tudo
  que esta ADR formaliza
- `docs/infra/aws-specs.md` seção "Audit & Compliance" — estado
  declarativo atual; gaps endereçados parcialmente automaticamente
  via `required-tags-Project`
- `docs/backlog/phase-0.md` P0-B5 (DoD original)
- AWS docs:
  - [CloudTrail — Best practices for security trails](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/best-practices-security.html)
  - [AWS Config — Conformance Packs](https://docs.aws.amazon.com/config/latest/developerguide/conformance-packs.html)
  - [Operational Best Practices for EC2](https://docs.aws.amazon.com/config/latest/developerguide/operational-best-practices-for-ec2.html)
  - [S3 Lifecycle — Glacier Instant Retrieval](https://docs.aws.amazon.com/AmazonS3/latest/userguide/glacier-instant-retrieval-storage-class.html)
- [awslabs/aws-config-rules — conformance pack templates](https://github.com/awslabs/aws-config-rules/tree/master/aws-config-conformance-packs)
