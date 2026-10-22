# Revisão das negociações — 22/10/2026

Revisão do mercado ativo do aplicativo offline: compra, venda, empréstimos, propostas, contratos, orçamento, escalação e virada do ano. Os achados abaixo foram conferidos no código e em cópias da carreira. A brecha de compra/venda também foi reproduzida pelos botões da interface, em um perfil Chromium isolado. Esta etapa registra problemas e propostas; as correções do motor ficam para a implementação.

## Falhas reproduzidas

### 1. Alta: vender e recomprar o mesmo jogador gera lucro imediato

**Evidência:** em uma carreira nova do Flamengo, o passe de Pedro vale R$ 4.224.000. O Palmeiras aceita comprá-lo por R$ 4.857.600 (115%). Logo depois, aceita revendê-lo por R$ 4.012.800 (95%), com luvas zero. O Flamengo termina novamente com o atleta e ganha **R$ 844.800**, ainda na rodada 1. Três ciclos renderam R$ 2.534.400. O dinheiro vem do comprador; o total dos clubes permanece conservado.

**Causa:** `src/engine/market.js:80` exige apenas 95% para compras; a linha 81 permite vendas a partir de um teto de 115%. Não há avaliação comum das duas pontas nem restrição para revenda imediata.

**Correção proposta:** uma avaliação de compra e venda por clube/jogador/rodada, com preço de compra pelo clube inferior ao preço exigido para revendê-lo nas mesmas condições. Revalidar a necessidade do elenco e considerar o negócio recente. Usar restrição de revenda imediata como proteção adicional, sem depender só de um prazo para esconder a diferença de preços.

**Aceite:** repetir os mesmos dois negócios não produz lucro garantido sem passagem de tempo ou mudança das condições. Dinheiro, atleta, contratos e registros financeiros continuam conciliados; falhas de gravação preservam o estado anterior.

### 2. Média: empréstimo pago sem partidas restantes

**Evidência:** com as 38 rodadas concluídas e `currentRound = 39`, foi possível emprestar Pedro por R$ 337.920. A rotina de retorno trouxe o atleta de volta sem disputar nenhuma partida entre a cessão e o retorno.

**Causa:** `src/engine/market.js:54` bloqueia partida aberta, mas não a ausência de jogos restantes. A taxa fixa de 8% não considera a duração; a linha 99 fixa o retorno no mesmo ano.

**Correção proposta:** bloquear novos empréstimos da temporada encerrada; calcular a taxa pela duração restante e informar quantidade estimada de jogos e data de retorno antes da assinatura. Se houver empréstimo para o próximo ano, modelar início e término explicitamente.

**Aceite:** não cobrar empréstimo com zero jogos de vigência. Contratos e empréstimos já existentes continuam retornando uma única vez, com o salário acordado preservado.

### 3. Média: um negócio desfaz a escalação escolhida pelo técnico

**Evidência:** Gonzalo Plata foi colocado manualmente no lugar de Pedro. Ao contratar Lucas Evangelista para o banco, Pedro voltou automaticamente aos titulares e Plata saiu, apesar de a contratação ser de um meia que permaneceu reserva.

**Causa:** `src/engine/market.js:103` executa `autoSelectStarters` nos dois clubes depois de todo negócio. A rescisão também refaz a escalação, em `src/engine/contracts.js:85`.

**Correção proposta:** preservar titulares e sua ordem no clube do usuário. Contratados entram no banco; a saída de um reserva não altera os titulares. Quando sair um titular, preencher somente sua vaga ou solicitar ajuste, respeitando disponibilidade e posição. A IA pode continuar reescalando seu próprio clube.

**Aceite:** comprar, vender, emprestar ou rescindir um reserva mantém os mesmos 11 titulares e as escolhas táticas. Uma vaga aberta por saída de titular não altera as outras dez escolhas.

### 4. Média: clubes externos ainda não negociados ficam congelados na base

**Evidência:** após cinco transições reais da carreira, de 2026 até 2031, o primeiro carregamento do 1º de Agosto ainda trouxe José Macaia com os mesmos 32 anos da base de 2026. Seu novo contrato foi inicializado em 2031, sem atualizar os cinco anos anteriores.

**Causa:** `src/engine/market.js:28` copia diretamente o clube estático. `src/engine/career.js:425` envelhece os clubes da carreira e os externos já materializados; os demais só aparecem depois, ainda no estado inicial.

**Correção proposta:** preparar o clube externo até o ano atual antes de apresentá-lo para negócios, usando uma atualização determinística. Busca, ficha, avaliação de interesse e transação precisam consultar a mesma versão. Guardar versão/ano da atualização e alterações necessárias, sem simular e salvar 703 temporadas completas nem fazer a simples consulta mudar os resultados futuros.

**Aceite:** consultar e negociar no mesmo ano mostra idade e situação coerentes, com aposentadorias e substituições quando aplicáveis. Reabrir o save não envelhece os atletas duas vezes nem ressuscita jogadores já transferidos, liberados ou aposentados.

### 5. Baixa: busca exige acentos exatos

**Evidência:** `Jose Manuel López` não encontrou nenhum jogador; `José Manuel López` encontrou um.

**Causa:** `src/engine/market.js:172` e a linha 181 só convertem para minúsculas. A aplicação já tem normalização de acentos em outras buscas.

**Correção proposta:** normalizar consulta e nome do jogador da mesma forma, preservando a grafia original na exibição. Incluir testes com José/Jose, João/Joao e variações de maiúsculas.

## Limitações das regras atuais

Estas duas situações são limitações de modelagem, distintas dos erros de fluxo acima.

### Orçamento e necessidade pouco influenciam o comprador automático

O caixa do comprador é verificado em `src/engine/market.js:85`, mas os limites de negociação e folha só são checados quando o usuário está comprando, na linha 86. Em um cenário isolado, o Palmeiras aceitou uma compra de R$ 4.224.000 com verba disponível zero e passou R$ 23.900 do limite salarial. Os limites foram reduzidos deliberadamente para verificar essa condição.

Na venda manual, qualquer clube com caixa pode aceitar o negócio dentro do teto, sem avaliação de necessidade ou qualidade do jogador. A geração de propostas considera necessidade da posição para ordenar clubes, mas isso não governa a venda manual. A documentação atual já informa que a economia completa da IA não está implementada.

**Melhoria recomendada:** usar a mesma avaliação de orçamento, folha, necessidade por posição, nível do elenco e reputação em propostas geradas e negócios manuais. Clubes que não podem ou não querem contratar devem explicar o motivo antes da confirmação. A simulação financeira da IA precisa ser compatível com suas receitas e despesas; aplicar apenas um bloqueio pode paralisar o mercado.

### O passe de referência não acompanha a evolução do jogador

`MarketEngine.quote`, em `src/engine/market.js:35`, usa o `player.value` existente. A evolução anual muda força e idade em `src/engine/career.js:349`, mas não recalcula esse valor. Em um cenário sintético de crescimento, a força passou de 56 para 58 e o passe permaneceu em R$ 4.224.000. O desempenho já influencia propostas e o teto das vendas; não é correto afirmar que ele não tem efeito algum sobre o mercado.

**Melhoria recomendada:** recalcular uma avaliação de referência limitada por idade, força, evolução, desempenho, duração do vínculo e utilização. Mostrar uma faixa estimada e a justificativa, mantendo preços estáveis dentro da mesma rodada e evitando valorizações exageradas após um único gol.

## Melhorias de experiência sugeridas

| Prioridade | Melhoria | Resultado esperado |
| --- | --- | --- |
| Primeiro pacote | Corrigir diferença entre compra/revenda, empréstimos sem jogos e escalação involuntária | Evitar exploração econômica e preservar decisões do técnico |
| Primeiro pacote | Resumo financeiro antes de confirmar | Passe/taxa, luvas, salário, caixa após o negócio, folha comprometida e prazo juntos |
| Primeiro pacote | Mostrar impedimentos antes da tentativa | Falta de verba, indisponibilidade, mínimo de jogadores, último goleiro e ausência de interesse com motivo claro |
| Segundo pacote | Regras compartilhadas de interesse e orçamento da IA | Clubes compram conforme seus recursos e necessidades |
| Segundo pacote | Corrigir atualização dos clubes externos e avaliação dos passes | Mercado coerente ao longo das temporadas |
| Segundo pacote | Filtros por preço máximo, salário, idade e situação contratual | Encontrar reforços acessíveis; hoje a interface só oferece nome, posição e força mínima e limita a seleção aos 100 mais fortes |
| Segundo pacote | Proposta, contraproposta e recusa fundamentada | Negociação com limites e motivos; evitar que a resposta revele sempre um preço exato garantido |
| Posterior | Preferência do atleta e papel prometido no elenco | Salário, reputação, chances de jogar e competição influenciam a assinatura |
| Posterior | Empréstimos com salário dividido e opção de compra | Mais alternativas para clubes com pouco caixa |
| Posterior | Parcelas e bônus por metas | Mais flexibilidade, acompanhada de agenda de obrigações futuras e proteção contra comprometer o caixa várias vezes |

Parcelamento deve vir depois das correções de preço e orçamento: hoje ele ampliaria as brechas e exigiria persistência, conciliação e validação de obrigações futuras ainda inexistentes.

## Verificações executadas

- Mercado/desempenho: **8 grupos passaram**.
- Economia/contratos: **15 grupos passaram**.
- Finanças: **12 grupos passaram**.
- Reproduções adicionais das cinco falhas e das duas limitações descritas acima, com clubes copiados e armazenamento em memória.
- Interface Chromium real: venda e recompra pelos controles da tela, dois negócios concluídos, Pedro novamente no Flamengo, R$ 844.800 de diferença e rodada inalterada, sem erros de JavaScript.

As suítes existentes cobrem propriedade única, conservação do dinheiro, salários dos empréstimos, vencimentos, retomada e falha de gravação. Elas passaram, mas não verificavam os cenários adicionais desta revisão. Os saves do jogador não foram utilizados. As alterações anteriores da análise tática foram preservadas.
