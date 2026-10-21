# Meu perfil

A barra superior tem uma aba **Meu perfil**. O perfil pertence ao técnico e acompanha a carreira no mesmo save, mesmo quando ele assume outro clube.

## Histórico e troféus

- Nome do técnico, editável no próprio perfil.
- Passagens pelos clubes, com escudo, período, jogos, vitórias, empates, derrotas, gols e campanhas anuais.
- Totais de jogos, vitórias, aproveitamento, títulos e acessos.
- Sala de troféus com competição, ano e clube de cada conquista. Os títulos das Séries A–D são reconhecidos ao concluir a última rodada; avançar o ano ou recarregar não duplica a conquista.

Os títulos e as estatísticas usam as classificações e os resultados da própria carreira. O histórico distingue as passagens, inclusive se o técnico voltar a dirigir um clube. Um acesso conta separadamente de um título. Durante a temporada, a posição do clube aparece como campanha em andamento.

## Propostas de outros clubes

Ao encerrar o campeonato e clicar em **Iniciar temporada**, chegam até três propostas para o novo ano. Um contador aparece em **Meu perfil**. Há convites da divisão atual e de outra divisão elegível. Título, acesso ou uma colocação entre os seis primeiros permitem interesse de uma divisão acima; as demais campanhas recebem convites da divisão atual ou da inferior, quando houver.

As propostas incluem somente os 80 clubes das quatro divisões brasileiras simuladas. Os demais clubes continuam disponíveis na consulta e no mercado de jogadores.

1. Abra **Meu perfil** antes de jogar a primeira rodada do novo ano.
2. Veja o clube, a divisão, o caixa e o tamanho do elenco.
3. Clique em **Aceitar proposta**, confira a mudança e use **Confirmar mudança**. **Cancelar** mantém a carreira como está.
4. Ou clique em **Recusar** para continuar no clube atual e manter os outros convites disponíveis.

A mudança é imediata na pré-temporada. O técnico assume o elenco, o estádio e o saldo existentes no destino. O antigo clube mantém seus jogadores e dinheiro. O calendário, a classificação, a escalação e os próximos adversários passam a acompanhar a divisão do novo clube. As outras propostas são encerradas.

As propostas expiram quando a primeira partida começa. Isso também impede mudar de clube durante uma partida salva em andamento. Os convites não mudam ao recarregar e as recusas são preservadas. As últimas propostas encerradas ficam disponíveis para consulta.

## Saves existentes

Basta reabrir o jogo e carregar a carreira. O perfil recupera as temporadas e os títulos que já constam no histórico do save. Sem registros de anos anteriores, ele começa com o clube e a campanha disponíveis; não inventa passagens ou conquistas.

Um save que já esteja antes da primeira rodada, com o ano anterior registrado, recebe as propostas da pré-temporada ao carregar. Se a temporada já começou, os próximos convites chegam no ano seguinte.

O perfil, as passagens, o nome e as decisões sobre propostas fazem parte do JSON salvo e exportado. Aceitar ou recusar só substitui a carreira aberta depois que a gravação funciona. O recurso continua totalmente offline.

## Verificação

```bash
node scripts/test-manager-profile.cjs
./scripts/test-manager-profile.sh
node scripts/test-career.cjs --quick
node scripts/test-live-match.cjs
./scripts/test-offline.sh
```

A suíte do perfil cobre migração, títulos sem duplicação, propostas estáveis, recusas, expiração, mudança na mesma divisão e entre divisões, temporadas com dois clubes, propriedade dos jogadores e saldos, e falha de gravação. O teste nativo usa armazenamento isolado e uma carreira de teste; não acessa os saves do jogador.

Nesta alteração, passaram as suítes de perfil, continuidade da carreira, partidas ao vivo e motor. A compilação do teste GTK/WebKit passou, mas sua execução visual ficou bloqueada pelas restrições do ambiente ao acesso ao display. O teste nativo acima está disponível para execução em uma sessão gráfica local.
