# ADR-0012 — Escopar permission set IAM Identity Center via policy híbrida (tag-based + ARN-enumerated), com `AdministratorAccess` como break-glass

- **Status:** accepted
- **Data:** 2026-05-02
- **Decisores:** Allysson Christopher
- **Tags:** security, infra, iam, devsecops, aws, learning-trade-off

## Contexto

A **ADR-0008** (pivot AWS EC2 efêmera) provisionou o usuário `allysson` no
IAM Identity Center com permission set `AdministratorAccess` AWS-managed —
escolha consciente de Phase 0 inicial pra desbloquear todo o setup manual
(EC2, IAM Role, Security Group, Budget, Cloudflare token, audit baseline).
**Follow-up #5** do `docs/infra/aws-specs.md` ficou explícito desde o
fechamento de P0-B4: "permissão broad — escopar quando primeiro deploy
formal entrar".

A **ADR-0010** declarou AWS como eixo deliberado de aprendizado e
introduziu **P0-B6** no backlog Fase 0 como tarefa que materializa o
princípio com baixo custo, junto com P0-B5 (audit baseline). A ordem
escolhida — B5 antes de B6 — é deliberada: CloudTrail + Config (ADR-0011)
estão capturando toda chamada de API desde 2026-05-02 17:19 UTC, então
qualquer ação fora-do-escopo durante a transição vira evidência rastreável
em vez de fato perdido.

A pergunta de design que esta ADR fixa: **como expressar "este permission
set só faz operações no projeto ecommerce-microsservicos" em IAM puro,
sabendo que o vocabulário disponível é heterogêneo entre serviços AWS?**

Forças em jogo:

- **Tags policy do projeto (ADR-0008)** existe em `Project=ecommerce-microsservicos`,
  mas tem **gaps reais** documentados em `aws-specs.md` follow-ups #1/#2/#3:
  EC2 (`i-072708190abd3d102`), Root EBS (`vol-03f00b3758be2f0c8`) e
  Security Group (`sg-06f620dffedd9008f`) **não têm a tag**. Qualquer
  policy puramente tag-based falha em alcançar esses recursos.
- **`aws:ResourceTag` cobertura é incompleta** entre serviços. Funciona
  bem em EC2/EBS/EIP/IAM Role/Trail. **Não funciona** uniformemente em
  S3 (bucket-level tem `aws:ResourceTag` mas a maioria das ações usa
  resource-level que precisa de ARN), IAM (a maioria das ações), Budgets,
  Config service (parte das ações).
- **Ações `Create*` quase sempre não têm ARN no momento da chamada.**
  `ec2:RunInstances` cria a instância com tag aplicada via `aws:RequestTag`,
  não `aws:ResourceTag`. Tag-based puro falha aqui também — precisa
  vocabulário diferente.
- **Conta solo educacional, mas conta compartilhada com legacy.** Conta
  `905418198749` tem 7 buckets S3 legacy + 2 ACM certs + default VPC
  inteira (achado registrado em ADR-0011 §"Achados notáveis"). Policy
  precisa **negar** ações em recursos legacy mesmo que eu peça
  ingenuamente — defesa contra erros operacionais do próprio dev.
- **Break-glass real é necessário.** Solo dev sem segundo humano de
  reserva — se a policy quebrar fluxo crítico, não tem ninguém pra
  resgatar. Tirar `AdministratorAccess` completamente seria pintar
  no canto.
- **Identity Center user/permission set ficou explicitamente fora do
  state OpenTofu** por decisão prévia (`aws-specs.md` linha 520) —
  recurso humano, raramente muda. P0-B6 não força import; vira ADR
  específica se mudar.

A pergunta paralela — **onde implementar** (Console/CLI vs OpenTofu já
agora) — foi resolvida em conversa: Console/CLI segue o padrão de
Phase 0 (provisionar manual, registrar honesto, importar em P0-D1 se
e quando a decisão de Identity Center em IaC for tomada). Antecipar
OpenTofu agora puxaria estrutura `infra/terraform/aws/` + backend
remoto que ainda não existe — ficaria uma tarefa do tamanho de P0-D1
travestida de B6.

## Decisão

**Criamos o permission set `EcommerceProjectAdmin` no IAM Identity
Center com policy inline híbrida combinando tag-based, ARN-enumerated e
ações `Create*` com `aws:RequestTag` enforcement. `AdministratorAccess`
permanece atribuído ao mesmo usuário `allysson` como break-glass —
sem alarme novo nesta tarefa (CloudTrail já registra trocas de role;
EventBridge alarm fica como follow-up).**

`EcommerceProjectAdmin` vira o permission set **default de operação
cotidiana**. `AdministratorAccess` só é usado em emergência operacional
(policy quebrou fluxo crítico) — uso esporádico capturado por CloudTrail.

### Estrutura da policy híbrida (esboço — JSON final no arquivo de

implementação criado nesta sessão)

A policy combina 5 camadas:

1. **Leitura ampla sem condition** — `*:Describe*`, `*:List*`, `*:Get*`
   nos serviços relevantes (EC2, S3, IAM, CloudTrail, Config, Budgets,
   STS, SSM, Support). Necessário pra navegar console e debugar
   `AccessDenied` em outras ações. Trade-off aceito: posso _ver_ recursos
   legacy de outros projetos, mas não _modificar_ nem _acessar conteúdo_.

2. **Mutativas em recursos do projeto via tag-based** — `ec2:*` (exceto
   `RunInstances` e `Create*` sem ARN), `iam:Tag/UntagRole`, `cloudtrail:*`
   sobre o trail do projeto, condicionados a
   `aws:ResourceTag/Project = ecommerce-microsservicos`. Funciona pros
   recursos com tag completa (EIP, IAM Role, audit bucket, trail);
   **falha pros gaps #1/#2/#3** — registrado como consequência abaixo.

3. **ARN-enumerated pra recursos sensíveis sem tag-based confiável** —
   `s3:*` em `ecommerce-microsservicos-audit-905418198749` (bucket + objects),
   `config:*` no recorder/delivery channel default + conformance pack
   `ecommerce-OBP-EC2` + rule `required-tags-Project`, `budgets:*` no
   budget `ecommerce-microsservicos-monthly-30usd`.

4. **Ações `Create*` com `aws:RequestTag` enforcement** — `ec2:RunInstances`,
   `ec2:CreateVolume`, `ec2:CreateSecurityGroup`, `ec2:AllocateAddress`,
   `iam:CreateRole`, `cloudtrail:CreateTrail`, `s3:CreateBucket`,
   `config:Put*` exigindo `aws:RequestTag/Project = ecommerce-microsservicos`
   - `aws:TagKeys` contendo `Project,Environment,ManagedBy`. Faz a tags
     policy ser **enforced no IAM**, não só na disciplina manual — exercício
     direto de IAM granular do brief §0.1.

5. **Deny defensivo** — `iam:DeleteRole/DeleteUser/CreateUser`,
   `organizations:*`, `account:*`, `aws-portal:*ModifyBilling`,
   `sso-admin:*` (proteção contra auto-mutilação do permission set),
   `s3:DeleteBucket` em buckets legacy via `NotResource` enumerando os
   ARNs do projeto. Camada de fail-safe que sobrevive a erros nas camadas
   1-4.

### Casos especiais

- **SSM Session Manager (`ssm:StartSession`, `ssm:TerminateSession`,
  `ssm:ResumeSession`) sem condition de tag.** Razão: a EC2
  `i-072708190abd3d102` está hoje no gap #1 (sem tag `Project`).
  Aplicar tag-based em StartSession trancaria SSM — perda de admin
  access, em conflito direto com ADR-0009. Aceito como dívida explícita;
  resolve quando follow-up #1 for fechado (PR pré-D1 aplicando tags
  via `create-tags`). Após o fix, restringir StartSession por tag em
  ADR de revisão (não nesta).
- **Session duration:** 8h, mesma do `AdministratorAccess` atual. Não
  vamos mudar SSO token lifetime nesta tarefa.
- **MFA enforcement no permission set:** Identity Center já enforça MFA
  no nível do diretório (registrado em `aws-specs.md`); permission set
  herda. Não duplicar via condition `aws:MultiFactorAuthPresent` — vira
  redundância.

### Itens fora do escopo desta ADR

- **Migrar Identity Center pra OpenTofu state** — recurso humano, fica
  fora de IaC por decisão prévia. Revisitar via ADR específica se solo
  dev virar 2+ humanos.
- **EventBridge alarm pra uso de `AdministratorAccess` (break-glass).**
  CloudTrail já registra `sts:AssumeRoleWithSAML` com sourceIPAddress
  - principal — auditoria reativa funciona. Alarme proativo (notificar
    no momento) fica pra Grupo H ou Phase 4.
- **Validity check da policy via IAM Access Analyzer policy validation.**
  AWS oferece `aws accessanalyzer validate-policy`; vale rodar como
  exercício mas não vou bloquear o PR nele — ele alerta sobre best
  practices que podem não bater com casos legítimos do projeto.
- **Policy review periódica.** Solo dev sem ciclo formal de review.
  Revisitar quando primeiro deploy real entrar (Phase 1) ou quando
  novo serviço AWS-native entrar via ADR-0010 (toda nova ADR específica
  Phase 2 deve checar se o permission set precisa expandir).
- **Logging detalhado de sessões SSM (output completo).** Continua
  follow-up #6, sem mudança nesta tarefa.

## Consequências

**Positivas:**

- **Resolve follow-up #5 do `aws-specs.md`** — `AdministratorAccess`
  broad some do uso cotidiano. Princípio do menor privilégio
  (brief §0.1) materializado em IAM puro, não só em prosa.
- **Tags policy enforced no IAM, não só por disciplina** — `aws:RequestTag`
  conditions em `Create*` fazem a AWS recusar criação de recurso novo
  sem tags obrigatórias. Disciplina manual deixa de ser única linha
  de defesa.
- **Defesa contra erros operacionais em conta compartilhada.** 7 buckets
  S3 legacy + 2 ACM certs + default VPC ficam protegidos por `NotResource`
  / Deny defensivo — `aws s3 rb` ingênuo num bucket legacy retorna
  `AccessDenied` em vez de obliterar dado de outro projeto pessoal.
- **Materializa ADR-0010 com exercício IAM granular puro.** Não traz
  serviço AWS-native novo (Cognito, Secrets Manager) mas exercita
  `aws:ResourceTag`, `aws:RequestTag`, `aws:TagKeys`, `NotResource`,
  Deny defensivo, ARN composition — vocabulário central de IAM que
  é skill universal AWS-native.
- **Auditoria assimétrica entre uso normal e emergência.** Toda chamada
  via `EcommerceProjectAdmin` tem principal específico no CloudTrail;
  toda chamada via `AdministratorAccess` também — mas cruzando os dois
  fica óbvio quando break-glass foi usado. Material pra alarm futuro
  (EventBridge na Fase 4).
- **Pré-requisito futuro pra qualquer permission set adicional**
  (read-only, deploy-only, observability-team) — esta ADR fixa o padrão
  de policy híbrida; permission sets futuros copiam o esqueleto.

**Negativas / trade-offs aceitos:**

- **Recursos atuais em gap (EC2, Root EBS, SG do projeto) ficam fora
  do escopo tag-based.** Operações sobre eles via `EcommerceProjectAdmin`
  vão falhar com `AccessDenied` _exceto_ nas ações cobertas por
  ARN-enumerated explícito ou pela exceção SSM. Sinal forte: o **PR
  imediato pós-merge desta ADR é o de fix dos follow-ups #1/#2/#3**
  (aplicar tags em EC2/EBS/SG). Antes desse fix, operações como
  `ec2:StopInstances` / `ec2:StartInstances` na EC2 vão exigir
  break-glass — fricção real, mas didática.
- **Policy longa, ~150-200 linhas JSON.** Não é elegante. Trade-off
  aceito porque IAM AWS é assim — qualquer policy de menor privilégio
  realista nessa escala fica nesse tamanho. Tentativa anterior (ver
  alternativa A) mostrou que tag-based puro fica curto **e quebra**.
- **Risco de lockout até validar.** Se a policy tiver bug e eu trocar
  pra `EcommerceProjectAdmin` antes de testar, posso ficar incapaz de
  consertá-la. **Mitigação: shell paralelo no `AdministratorAccess` mantida
  aberta durante toda a validação** — não trocar profile na sessão de
  trabalho até o novo permission set estar comprovadamente funcional.
- **Cobertura "leitura ampla sem condition" é assimétrica.** Posso ver
  legacy de outros projetos (ACM certs, buckets, default VPC). Não é
  vazamento de segurança (sou o dono da conta), mas é exposição
  visual indesejada. Aceito porque tirar `*:Describe*` quebra navegação
  no console — escolha pragmática registrada.
- **`AdministratorAccess` continua atribuído.** Em rigor estrito,
  presença do permission set broad é vetor potencial. Mitigação:
  CloudTrail captura todo `AssumeRoleWithSAML` com timestamp + IP +
  principal — uso indevido fica visível na auditoria. Solo dev = único
  vetor humano possível é o próprio dev.
- **Sem ramp gradual** (modo "shadow" / "audit-only" antes de enforce).
  IAM não tem esse modo nativamente; melhor approximation seria
  policy simulator + dry runs caso a caso. Aceito que primeira tentativa
  vai capturar boa parte dos gaps; vamos iterar a policy via PRs
  específicos quando real-world uso achar lacuna.

**Neutras / a observar:**

- **Permission set fica `ManagedBy=manual` por princípio** — registrado
  em `aws-specs.md` seção "IAM Identity Center". Identity Center
  resources não entram em state OpenTofu por decisão prévia (linha
  520 do mesmo doc).
- **Validação real prevista no PR:** lista de comandos que devem
  retornar 200 vs `AccessDenied` esperado. Achados inesperados durante
  a validação entram aqui em iteração futura ou viram follow-up novo.
- **Quando ADR-0010 abrir Phase 2 com Secrets Manager / RDS / etc.,
  esta policy vai precisar update** — adicionar Allow blocks pros
  novos serviços. ADRs específicas das migrações Phase 2 carregam a
  responsabilidade de proporem o diff de policy correspondente.
- **Recursos AWS criados nesta sessão (`ManagedBy=manual`):**
  permission set `EcommerceProjectAdmin` (com inline policy
  `EcommerceProjectAdminPolicy`) + account assignment ligando ao
  user `allysson` na account 905418198749. ARNs ficam registrados
  em `aws-specs.md` seção "IAM Identity Center" após criação.

## Alternativas consideradas

- **A. Tag-based puro (`Condition: aws:ResourceTag/Project = ecommerce-microsservicos`
  em todas as actions)** — descartada. Cobertura incompleta (S3
  bucket-level + IAM + Budgets + parte do Config não suportam ou exigem
  vocabulário diferente). Ações `Create*` não têm `aws:ResourceTag`
  no momento da chamada — só `aws:RequestTag`. Recursos atuais com
  gaps (#1/#2/#3) ficariam totalmente fora do escopo. Ficaria curta
  no JSON, mas quebraria fluxos reais.
- **B. ARN-enumerated puro (lista todos os ARNs explicitamente)** —
  descartada. Funciona em 100% dos serviços, mas obriga update da
  policy toda vez que recurso novo entra (toda nova EC2, todo novo
  bucket, todo novo Config rule). Atrita com o modelo ephemeral
  (ADR-0008) — nova EC2 toda subida exige rebuild da policy. Verbose
  sem ganho proporcional sobre a híbrida.
- **C. Híbrida (escolhida)** — combina tag-based onde funciona +
  ARN-enumerated pros recursos sensíveis + `aws:RequestTag` pros
  Create + Deny defensivo + leitura ampla pra navegação. Cobre as
  lacunas das outras duas. Trade-off: policy mais longa e mais
  decisões a tomar — aceito como exercício real de IAM granular.
- **D. Implementar via OpenTofu agora (antecipar P0-D1)** —
  descartada. P0-D1 não começou; estrutura `infra/terraform/aws/`
  ainda não existe; backend remoto Backblaze B2 / S3 também não.
  Trazer permission set pra IaC força puxar tudo — vira tarefa do
  tamanho de P0-D1 disfarçada de B6. Identity Center user/permission
  set fica explicitamente fora de OpenTofu por decisão prévia
  (`aws-specs.md` linha 520).
- **E. Tirar `AdministratorAccess` completamente após criar
  `EcommerceProjectAdmin`** — descartada. Solo dev sem segundo
  humano de reserva = se policy quebrar fluxo crítico, lockout
  recoverable apenas via root account (caminho doloroso, exige MFA
  hardware no caso real). `AdministratorAccess` como break-glass
  é mitigação proporcional.
- **F. Adiar P0-B6 pra depois de P0-D1 (escopar via OpenTofu já
  com IaC pronta)** — descartada. ADR-0010 introduziu B6 como tarefa
  Phase 0 deliberada justamente pra dar materialidade ao princípio
  AWS-native sem esperar Phase 2. Adiar pra D1 acumula `AdministratorAccess`
  broad por mais semanas + perde a janela onde audit baseline (B5)
  está fresca pra capturar a transição.
- **G. EventBridge alarm pra uso de `AdministratorAccess` ainda nesta
  ADR** — adiada. CloudTrail audit reativa cobre o caso solo dev;
  alarme proativo (Slack/email no momento da troca) é melhoria mas
  não bloqueia a decisão central. ADR específica em Grupo H ou Phase 4.

## Referências

- `PROJECT_BRIEF.md` §0.1 (princípio do menor privilégio, defense in
  depth, auditoria, pentest mindset), §0.2 (AWS como eixo deliberado —
  adendo de ADR-0010)
- ADR-0008 (pivot AWS EC2 — fonte do user `allysson` no Identity Center
  - tags policy que esta ADR enforça via IAM)
- ADR-0009 (SSM Session Manager — exceção `ssm:StartSession` sem tag
  desta ADR é decorrência direta)
- ADR-0010 (AWS como eixo deliberado — esta ADR materializa o princípio
  via exercício IAM granular)
- ADR-0011 (audit baseline — CloudTrail captura toda transição entre
  permission sets desde 2026-05-02 17:19 UTC)
- ADR-0006 (repo público — motiva rigor de IAM scoping; código educacional
  - IAM broad seria assimetria de defesa)
- `docs/infra/aws-specs.md` seção "IAM Identity Center" (estado anterior),
  seção "Follow-ups conhecidos" #5 (resolvido por esta ADR), follow-ups
  #1/#2/#3 (cuja resolução fecha as exceções desta policy)
- `docs/runbooks/aws-permission-set-management.md` — runbook reproduzível
  do que esta ADR formaliza (criado nesta sessão)
- `docs/backlog/phase-0.md` P0-B6 (DoD original)
- AWS docs:
  - [IAM Identity Center — Permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html)
  - [IAM JSON policy elements: Condition operators](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html)
  - [`aws:ResourceTag` global condition key](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-resourcetag)
  - [`aws:RequestTag` and `aws:TagKeys`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-requesttag)
  - [Policy validation with IAM Access Analyzer](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html)
  - [Service authorization reference (per-service action support for tags)](https://docs.aws.amazon.com/service-authorization/latest/reference/reference.html)
- [AWS Well-Architected — Security pillar — Identity and access management](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/identity-and-access-management.html)
