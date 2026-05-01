# ADR-0009 — Substituir SSH público por AWS SSM Session Manager para acesso administrativo à EC2

- **Status:** accepted
- **Data:** 2026-05-01
- **Decisores:** Allysson Christopher
- **Tags:** security, infra, devops, devsecops, iam

## Contexto

A **ADR-0008** estabeleceu AWS EC2 (`us-east-1`, AL2023) como plataforma
de execução do projeto. Pergunta peer imediata: **como acessamos a
instância para administração** (debug, inspeção, operações manuais
durante incidente)?

O caminho default da AWS — e o usado durante a sessão de provisionamento
inicial — é **SSH com chave PEM**. A EC2 nasceu com:

- Security Group `launch-wizard-2` (`sg-06f620dffedd9008f`) com regra
  ingress `tcp/22 ← 0.0.0.0/0` (porta SSH aberta para a internet inteira);
- Chave RSA `loja-microsservicos.pem` salva localmente, requerida para
  autenticação;
- `sshd` configurado pelo padrão AL2023 — `PasswordAuthentication no`,
  `PermitRootLogin forced-commands-only`, key-only para `ec2-user`.

Durante a sessão, o usuário levantou explicitamente a hipótese de que
"se a auth é só por chave e a chave está só na minha máquina, não é
suficiente?". A discussão de design que se seguiu identificou cinco
riscos que **a chave SSH não mitiga**:

1. **CVEs pre-auth no `sshd`.** OpenSSH tem histórico documentado de
   bugs antes da autenticação acontecer. Caso recente: **CVE-2024-6387
   ("regreSSHion")**, julho 2024 — RCE não-autenticado via race condition
   no signal handler; default configs vulneráveis; janela entre
   disclosure e exploitation em massa de ~24h. Padrão histórico: ~1
   issue grave de pre-auth a cada 2-3 anos. Quando a próxima vier, todo
   host com `22/tcp` aberto pro mundo é alvo automático de scanner.

2. **Log noise + custo de CPU/banda.** Sem firewall, dezenas de bots por
   minuto fazem TCP+SSH handshake. Cada handshake consome CPU, bytes e
   uma linha em `/var/log/auth.log`. Numa `t3.micro` de 916 MiB rodando
   observability stack, é fricção real. `fail2ban` (planejado em P0-C3)
   é remediação, não prevenção.

3. **Fingerprinting.** Porta aberta = atacante vê versão exata do
   `sshd`, host key, algoritmos suportados. Útil para targeting futuro.

4. **Drift de configuração.** Hoje `sshd` está bem. Daqui a 2 semanas,
   um Ansible playbook futuro com bug, ou um Renovate PR mal-revisado,
   ou adição de usuário com chave fraca pode reabrir caminho de
   autenticação. Network ACL (Security Group) é a camada que sobrevive
   a esses erros.

5. **Violação direta do `PROJECT_BRIEF.md` §0.1** — "**defense in depth
   — nenhuma camada confia totalmente em outra**". A chave SSH é uma
   camada; a network ACL é outra; o brief proíbe apostar tudo em uma
   única camada.

Forças adicionais em jogo:

- Repo é **público** desde ADR-0006. Chaves SSH long-lived na máquina
  dev não vão pro repo (gitleaks no pre-commit pega `*.pem` patterns),
  mas qualquer descuido (commit acidental, share de tela, malware no
  dev) compromete a chave indefinidamente até rotação manual.
- Brief §0.1 estabelece **pentest mindset** como princípio cross-cutting.
- AWS oferece, **gratuitamente**, mecanismo nativo de admin access que
  elimina porta inbound e substitui chave long-lived por IAM
  short-lived: SSM Session Manager.

## Decisão

**Adotamos AWS Systems Manager (SSM) Session Manager como mecanismo
único de acesso administrativo à EC2. Removemos a regra de ingress
`22/tcp ← 0.0.0.0/0` do Security Group; `sshd` continua rodando
internamente na instância mas inacessível da internet.**

Detalhes técnicos da implementação (concluída nesta sessão):

- **Agente na instância:** `amazon-ssm-agent` v3.3.4108.0 (pré-instalado
  e enabled em AL2023). Mantém conexão **outbound** persistente
  (HTTPS/443) com endpoints SSM (`ssm.us-east-1.amazonaws.com`,
  `ssmmessages.us-east-1.amazonaws.com`,
  `ec2messages.us-east-1.amazonaws.com`).

- **Identidade do agente — IAM Role `EcommerceEC2SSMRole`:** assumida
  pelo principal `ec2.amazonaws.com` (trust policy mínima). Permissions
  = AWS-managed policy `AmazonSSMManagedInstanceCore` (escopo mínimo
  para Session Manager + Run Command + Patch Manager). Credenciais
  temporárias chegam ao agente via IMDSv2
  (`http://169.254.169.254/latest/meta-data/iam/security-credentials/EcommerceEC2SSMRole`),
  rotacionadas automaticamente pelo serviço de instance profile (~6h).
  Wrapping em **Instance Profile** de mesmo nome (limitação histórica
  da API EC2 — anexa Instance Profile, não Role direto).

- **Plugin local `session-manager-plugin`:** v1.2.814.0, instalado em
  `~/.local/sessionmanagerplugin/bin/` com symlink em `~/.local/bin/` —
  **mesmo padrão per-user-no-sudo** de `gitleaks` (P0-A5) e `aws` CLI
  (instalado nesta sessão). Extração feita do `.deb` upstream via `ar`
  - `tar` para evitar `dpkg` com `sudo`.

- **Comando administrativo padrão:**

  ```bash
  aws ssm start-session --target i-072708190abd3d102
  ```

  Drop em shell como `ssm-user` (criado automaticamente pelo agent,
  com `sudo` NOPASSWD). Para shell como `root`, comandos não-interativos
  via `aws ssm send-command --document-name AWS-RunShellScript`.

- **Autenticação humana:** via **IAM Identity Center** (configurado
  conforme ADR-0008). `aws ssm start-session` herda o profile SSO
  (`AWS_PROFILE=AdministratorAccess-905418198749`). Permissão necessária
  (`ssm:StartSession`) já coberta pelo permission set `AdministratorAccess`;
  quando escoparmos esse permission set (futuro), garantir que
  `ssm:StartSession` + `ssm:DescribeInstanceInformation` permaneçam.

- **`sshd` interno preservado:** continua rodando, escutando em todas
  as interfaces, mas inalcançável da internet (SG não permite). **Não
  desabilitamos sshd** — fica como ferramenta de fallback interno e
  para SSH-over-SSM (ver abaixo). Decisão futura sobre desligar de vez
  ou amarrar a `127.0.0.1` cabe no Grupo C (Ansible bootstrap).

- **Security Group hardenizado:**
  - Ingress `22/tcp ← 0.0.0.0/0`: **removido** (regra
    `sgr-01305bd44277c627c` revogada).
  - Ingress restante: vazio.
  - Egress `all ← 0.0.0.0/0`: **mantido** (necessário para o agent
    alcançar endpoints SSM via HTTPS).

- **Auditoria:** todas sessões SSM aparecem em **CloudTrail**
  (`StartSession`, `TerminateSession` com timestamp, principal IAM,
  source IP). Habilitação de logging de comandos da sessão para S3 ou
  CloudWatch Logs fica como exercício futuro (P0-G\* / Grupo H).

- **SSH-over-SSM (decisão habilitada, uso adiado):** quando precisar de
  `scp` / `rsync` (futuro provável em P0-F\*, deploy via SSH), o pattern
  é configurar `~/.ssh/config` com `ProxyCommand` usando
  `aws ssm start-session --document-name AWS-StartSSHSession`. SSH
  continua sendo o protocolo de transporte, mas **o transporte vai por
  dentro do túnel SSM** — sem porta 22 aberta. Documentar em runbook
  quando virar necessário.

**Fora do escopo desta ADR:**

- Logging detalhado de sessões SSM (output para S3/CloudWatch Logs);
- Escopo restrito do permission set humano (hoje é `AdministratorAccess`
  amplo — ver ADR-0008);
- VPC Endpoints para SSM (decisão de Fase 2+ se sair do default VPC ou
  for para subnet privada);
- Hardening adicional de `sshd` interno (cabível em Grupo C);
- Estratégia de admin access para futuras instâncias adicionais (k3s
  multi-nó da Fase 2 do brief).

## Consequências

**Positivas:**

- **Zero portas inbound necessárias na EC2.** Atacante na internet **não
  consegue iniciar TCP handshake** com a instância. Elimina exposição
  às 5 categorias de risco listadas no Contexto.
- **Resistência a CVEs pre-auth do `sshd`.** Mesmo se nova `regreSSHion`
  cair amanhã, atacante teria que estar **dentro da AWS API** (com
  credenciais IAM válidas) para iniciar o transporte que chega no
  `sshd`.
- **Sem chaves SSH long-lived na máquina dev** como vetor crítico. A
  `loja-microsservicos.pem` continua existindo (em `~/.ssh/`, fora do
  repo, perm `400`), mas perdeu o status de "única tranca" — agora é
  fallback opcional caso SSM quebre. Em ADR futura podemos rotacionar
  ou descartar.
- **Auditoria centralizada via CloudTrail** — todo `StartSession` e
  `TerminateSession` registrado com `principalArn` (Identity Center
  user assumindo SSO role), `sourceIPAddress`, timestamp. Base para
  compliance futura (SOC 2, LGPD audit trail) que o brief planeja.
- **Tokens humanos curtos.** Acesso humano vai por SSO (8h max);
  expira sozinho. Substitui chave SSH long-lived (que a literatura
  trata como "credencial permanente" — durações típicas em projetos
  reais: anos).
- **Rotação automática de credenciais do agent** via STS (Role
  temporário renovado pelo IMDS). Sem operação humana, sem falha por
  esquecimento.
- **Padrão portável.** Mesmo conceito (out-of-band admin access via API
  - IAM, sem porta inbound) existe em GCP (IAP — Identity-Aware Proxy)
    e Azure (Bastion / Just-in-time VM access). Skill se transfere.

**Negativas / trade-offs aceitos:**

- **Dependência da AWS API estar UP.** Se SSM service tiver outage,
  perdemos acesso até voltar. Mitigação: AWS publica SSM SLA;
  fallback histórico para emergências = **EC2 Instance Connect** via
  Console do navegador (envia chave pública temporária via API
  separada; requer reabrir 22/tcp temporariamente — operação manual
  documentada em runbook futuro).
- **Plugin extra na máquina dev** (`session-manager-plugin`). Adiciona
  ferramenta a manter atualizada. Mitigação: padrão `~/.local/bin/`
  consistente com gitleaks/aws CLI; futuro `tools/install-dev-tools.sh`
  pode pinar versão.
- **Latência ligeiramente maior que SSH direto** — ~200ms vs ~150ms
  típico. Imperceptível para uso interativo; pode notar em `scp` de
  arquivo grande (mas isso vira SSH-over-SSM, ainda usável).
- **Curva de aprendizado.** Pequena (5 comandos novos), mas não-zero.
  Documentação em runbook adicional (não criado nesta PR — fica para
  Grupo I).
- **CloudTrail só registra eventos, não conteúdo da sessão por
  default.** Para compliance que exija session recording, ativar
  logging de sessão para S3/CloudWatch (não feito agora).
- **Conta única (ADR-0008) ⇒ blast radius IAM-wide.** Quem tiver
  `ssm:StartSession` na conta pode entrar em qualquer instância dessa
  conta. Hoje só existe um humano (`allysson`) e um permission set
  (`AdministratorAccess`); quando for escopar, manter
  `ssm:StartSession` com filtro por tag (`aws:ResourceTag/Project`).

**Neutras / a observar:**

- `sshd` interno continua rodando. **Não decidimos desabilitar nesta
  ADR** — espaço aberto para Grupo C (Ansible bootstrap) decidir entre
  `sshd disabled`, `sshd listening on 127.0.0.1 only`, ou status quo
  (interno mas inalcançável). Cada opção tem trade-off didático.
- **Chave `~/.ssh/loja-microsservicos.pem`** continua existindo. Útil
  como fallback se a gente reabrir 22/tcp temporariamente em
  emergência. Em ADR futura podemos formalmente aposentar e
  desassociar key pair da AMI / launch template.
- **Recursos AWS criados:** `EcommerceEC2SSMRole` (IAM Role + Instance
  Profile), regra ingress `sgr-01305bd44277c627c` removida do SG
  `sg-06f620dffedd9008f`. Todos com tag `Project=ecommerce-microsservicos`,
  `ManagedBy=manual` — entrarão em state OpenTofu em P0-D1.

## Alternativas consideradas

- **SSH com Security Group restrito ao IP público atual do dev** —
  descartada. Resolve 4 dos 5 riscos (todos exceto pre-auth CVE no
  `sshd`, que continua aberta para o `/32` do dev). IP residencial muda
  com frequência (mudança de ISP, viagem, conexão móvel) — toda
  mudança = update manual do SG. Não adiciona auditoria centralizada.
- **EC2 Instance Connect (managed)** — adiada. AWS-managed wrapper
  para SSH com IAM auth + push de chave temporária. Funciona, mas
  mantém dependência conceitual de porta 22 aberta (mesmo com
  restrição a IPs da AWS Instance Connect service). SSM elimina porta
  inbound de vez. Instance Connect fica registrado como **fallback
  emergencial** se SSM quebrar.
- **SSH bastion / jumpbox dedicado** — descartada. Solução
  pre-cloud-native; adiciona uma instância para hardenizar; complica o
  mental model. SSM elimina a necessidade de bastion para o caso de
  uso de admin access humano.
- **Tailscale / WireGuard mesh VPN** — adiada. Excelente solução,
  multi-cloud, com controle fino sobre quem alcança o quê. Mas
  adiciona dependência de terceiro (Tailscale) ou setup de VPN
  full-mesh + key management próprio (WireGuard puro). Sobre-engenharia
  para solo dev hoje. Pode entrar quando houver mais de uma instância
  - serviços inter-comunicando entre VPCs/clouds.
- **Manter SSH público com chave forte (status quo Phase 0 inicial)** —
  descartada. Discutido extensivamente. Brief §0.1 (defense in depth)
  e o histórico de CVEs pre-auth (`regreSSHion` mais recente) tornam
  inaceitável para projeto que se autodeclara pentest-minded.
- **Desabilitar `sshd` completamente nesta ADR** — adiada
  conscientemente. SSM funciona, mas passou ~30 min de configuração
  pela primeira vez. Manter `sshd` interno (mas inalcançável da
  internet) preserva opção de fallback. Decisão de desligar de vez
  cabe no hardening da Ansible (Grupo C), com `sshd_config` formalmente
  versionado.

## Referências

- `PROJECT_BRIEF.md` §0.1 (segurança como prioridade, defense in depth,
  pentest mindset, princípio do menor privilégio)
- **ADR-0008** (AWS EC2 como plataforma — peer desta ADR, mesma
  sessão de design)
- ADR-0006 (cutover público — relevante porque chave SSH em repo
  público seria catastrófico; SSM elimina o risco)
- `docs/contributing/local-setup.md` (precisa de update mencionando
  `session-manager-plugin` em ferramentas instaladas — fica para
  commit futuro quando virar pre-requisito de setup oficial)
- AWS docs — [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html),
  [Configuring permissions for Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-permissions.html),
  [SSM Agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html),
  [`AmazonSSMManagedInstanceCore` policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html)
- CVE-2024-6387 ("regreSSHion") — [Qualys Security Advisory, julho 2024](https://www.qualys.com/2024/07/01/cve-2024-6387/regresshion.txt)
