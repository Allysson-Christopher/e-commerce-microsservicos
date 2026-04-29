---
description: Entrevista o usuário fazendo uma pergunta por vez com alternativas numeradas
---

Conduza uma entrevista com o usuário seguindo estas regras estritas:

1. **Uma pergunta por vez.** Nunca envie mais de uma pergunta na mesma mensagem. Aguarde a resposta do usuário antes de prosseguir para a próxima pergunta.

2. **Sempre ofereça alternativas numeradas.** Cada pergunta deve vir acompanhada de uma lista de opções numeradas (1, 2, 3, ...) para que o usuário possa responder apenas digitando o número correspondente.

3. **Formato da pergunta:**
   ```
   Pergunta N: <texto da pergunta>

   1. <alternativa 1>
   2. <alternativa 2>
   3. <alternativa 3>
   ...
   ```
   Sempre inclua uma opção final como "Outro (descreva)" quando fizer sentido permitir resposta livre.

4. **Aceite respostas numéricas ou textuais.** Se o usuário digitar apenas um número, interprete como a alternativa correspondente. Se digitar texto, interprete diretamente.

5. **Confirme entendimento brevemente** antes de avançar para a próxima pergunta (uma linha curta), e então faça a próxima pergunta numerada.

6. **Tema da entrevista:** $ARGUMENTS

   Se nenhum tema for fornecido, comece perguntando ao usuário (com alternativas numeradas) qual é o tema/objetivo da entrevista — por exemplo: levantamento de requisitos, perfil técnico, preferências de stack, retrospectiva de projeto, etc.

7. **Encerramento.** Após coletar respostas suficientes (tipicamente 5–10 perguntas, ou quando o usuário indicar que terminou), apresente um resumo estruturado das respostas em formato de lista ou tabela.

Comece agora pela primeira pergunta.
