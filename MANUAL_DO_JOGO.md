# Manual do Jogo - O Capital

Este manual descreve as regras de funcionamento implementadas no jogo. Ele foca na experiencia da partida, nas mecanicas economicas e nas acoes que os jogadores podem executar.

## 1. Objetivo

O objetivo de O Capital e acumular a maior fortuna ao longo da partida por meio de compra de titulos, construcao de propriedades, recebimento de alugueis, administracao de empreendimentos, negociacoes com jogadores e uso estrategico do banco.

A fortuna de cada jogador considera:

- saldo disponivel;
- valor dos titulos comprados;
- valor construido em propriedades;
- dividas a receber;
- dividas ativas a pagar.

O ranking ordena os jogadores ativos pela fortuna total, do maior para o menor valor.

## 2. Sala e Participantes

Uma sala pode ter de 2 a 6 jogadores. O primeiro participante da sala assume o papel de Banqueiro, e os demais entram como Jogadores.

Cada jogador escolhe nome, foto de perfil e cor. Nomes duplicados dentro da mesma sala nao sao permitidos, e uma cor ja escolhida por um jogador ativo nao pode ser repetida.

Jogadores podem ser eliminados. Ao eliminar um jogador, ele sai da ordem de turnos, seus titulos voltam a ficar sem dono e as propriedades desses titulos sao removidas.

## 3. Inicio da Partida

Ao iniciar a partida, todos os jogadores ativos recebem saldo inicial de R$ 10.000. A partida comeca na rodada 1, e todos os jogadores iniciam na casa Inicio.

A ordem de jogada segue a ordem configurada na sala. Se a ordem for alterada, apenas jogadores ativos permanecem nela. O jogador da vez e mantido quando ainda estiver ativo; caso contrario, o turno passa para o primeiro jogador disponivel.

## 4. Turnos, Rodadas e Dados

Cada turno pertence a um unico jogador. Durante sua vez, o jogador rola dois dados de 6 lados. A soma dos dados define quantas casas o jogador avanca no tabuleiro circular de 40 casas.

Um jogador so pode rolar os dados uma vez por turno. Depois de rolar, ele pode resolver as acoes e pendencias geradas pela casa atual e concluir a jogada.

Quando todos os jogadores ativos concluem uma jogada, a rodada avanca em 1. A partida registra a rodada atual para calcular prestacoes de contas, restricoes de construcao, historico e evolucao de valores.

## 5. Tabuleiro

O tabuleiro tem 40 casas. Existem casas de rua e casas especiais.

Casas de rua representam titulos compraveis, organizados por bairro. Cada rua pode possuir ate 3 terrenos de propriedade.

Casas especiais implementadas:

- Inicio: ponto inicial do tabuleiro.
- Evento: gera uma carta de sorte ou reves para o jogador da vez.
- Evento Global: gera uma carta de sorte ou reves que afeta todos os jogadores ativos.
- Banco: permite quitar dividas elegiveis e impostos pendentes com desconto.
- Receita Federal: aplica restituicao ou malha fina fiscal.
- Feriado, Embargo Fiscal, Mercado de Vantagens e Bloqueio Bancario: ja existem como casas no tabuleiro, mas ainda funcionam como estruturas preparadas para regras futuras.

## 6. Bairros e Bonus de Localidade

Cada rua pertence a um bairro. O bairro define cor visual e o tipo de bonus de localidade.

Bairros com bonus para imoveis adicionam 20% aos alugueis de propriedades imobiliarias construidas naquele bairro. Bairros com bonus para empreendimentos adicionam 20% aos recebiveis por rodada dos negocios construidos naquele bairro.

Bairros implementados:

- Ponta Negra: bonus para imoveis.
- Capim Macio: bonus para empreendimentos.
- Lagoa Nova: bonus para empreendimentos.
- Candelaria: bonus para imoveis.
- Tirol: bonus para imoveis.
- Alecrim: bonus para empreendimentos.
- Cidade Alta: bonus para empreendimentos.

## 7. Compra de Titulos

Um titulo e o direito de propriedade sobre uma rua. O jogador so pode comprar um titulo quando:

- esta em sua propria vez;
- esta posicionado na rua correspondente;
- a rua ainda nao tem dono;
- a rua tem valor definido;
- possui saldo suficiente.

Ao comprar, o valor do terreno e debitado do saldo do jogador, o titulo passa a pertencer a ele e a compra fica registrada no historico financeiro.

A rua Av. dos Geranios existe no tabuleiro sem valor definido; por isso, ela aparece como titulo sem valor pendente e nao pode ser comprada enquanto nao tiver preco no balanceamento.

## 8. Construcoes e Evolucoes

Cada titulo de rua possui ate 3 terrenos de propriedade. O dono do titulo pode construir apenas quando:

- esta em sua propria vez;
- esta na rua do titulo;
- o titulo nao foi comprado na mesma rodada;
- ainda nao fez outra acao de propriedade nesse titulo nesta mesma vez;
- possui saldo suficiente;
- o slot escolhido permite aquela propriedade.

Existem dois tipos de propriedade: imoveis e empreendimentos.

Imoveis possuem niveis e evoluem em sequencia:

1. Flat: custa R$ 5.000 e cobra aluguel base de R$ 1.500.
2. Casa: custa R$ 10.000 e cobra aluguel base de R$ 2.500.
3. Pousada: custa R$ 25.000 e cobra aluguel base de R$ 5.000.
4. Hotel: custa R$ 50.000 e cobra aluguel base de R$ 12.000.

Um slot vazio pode receber o primeiro imovel ou um empreendimento. Um imovel existente pode ser evoluido para o proximo nivel. Empreendimentos nao evoluem; para trocar, o jogador precisa destruir a propriedade e construir outra.

Empreendimentos implementados:

- Comercio de Alimentos: custa R$ 20.000 e rende R$ 4.000 por rodada.
- Loja: custa R$ 40.000 e rende R$ 8.000 por rodada.
- Grande Empreendimento: custa R$ 60.000 e rende R$ 12.000 por rodada.

Alguns empreendimentos exigem escolha de tipo, como restaurante, pizzaria, loja de roupas, mercado ou cinema. Essa escolha personaliza a propriedade, mas nao muda seus valores.

## 9. Destruicao de Propriedades

O dono pode destruir uma propriedade do titulo quando esta na sua vez, na rua correta, a partir de uma rodada posterior a compra do titulo e sem ja ter feito outra acao de propriedade naquele titulo durante a vez atual.

Destruir uma propriedade remove o item do titulo e registra uma transacao de valor zero. Nao ha reembolso implementado para destruicao.

## 10. Aluguel

Quando um jogador cai em uma rua que pertence a outro jogador, o jogo cria uma pendencia de aluguel se o titulo tiver propriedades imobiliarias com aluguel.

O aluguel e calculado pela soma dos alugueis base dos imoveis construidos no titulo, mais o bonus de localidade quando o bairro favorece imoveis.

Ao confirmar a pendencia:

- o jogador visitante paga o aluguel ao dono;
- o dono recebe o valor pago;
- se o visitante nao tiver saldo suficiente, ele paga tudo que puder e o restante vira divida ativa de aluguel;
- a divida aparece para o devedor e como valor a receber para o credor.

## 11. Prestacao de Contas por Volta

Ao passar pela casa Inicio, o jogo cria uma prestacao de contas da rodada para o jogador, desde que ainda nao exista uma pendencia dessa rodada.

A prestacao de contas soma:

- recebiveis de empreendimentos;
- manutencao dos titulos;
- impostos dos titulos.

O resultado liquido e calculado assim:

`recebiveis - manutencao - impostos`

Se o resultado for positivo, o jogador recebe o valor no saldo. Se for negativo, o valor e debitado. Quando o saldo nao cobre o debito total, o saldo vai ate zero e o restante vira divida ativa de taxas de rodada.

## 12. Manutencao

A manutencao de cada titulo corresponde a 5% da soma entre valor do terreno e valor construido naquele titulo.

O valor construido considera o custo original das propriedades construidas. A manutencao entra na prestacao de contas ao passar pelo Inicio.

## 13. Impostos

Cada propriedade gera imposto baseado no valor do terreno somado ao custo de construcao daquela propriedade.

Taxas por tipo:

- Imoveis: 10%.
- Empreendimentos: 15%.

O imposto de cada titulo e a soma dos impostos de suas propriedades. Esses valores entram na prestacao de contas por volta.

Impostos pendentes tambem podem existir separadamente como pendencias fiscais, e podem ser pagos no menu Banco ou com desconto na casa Banco.

## 14. Receita Federal

Ao cair na casa Receita Federal, o jogador pode confirmar uma conferencia fiscal durante sua propria vez. Essa acao so pode ser feita uma vez naquela jogada.

Se o jogador nao possui impostos pendentes, ele recebe uma restituicao de 10% sobre seu patrimonio em propriedades. O patrimonio em propriedades inclui terrenos e construcoes.

Se o jogador possui impostos pendentes, ele cai na malha fina e recebe uma multa de 50% sobre o total pendente. O jogo tenta descontar a multa do saldo. Se o saldo nao for suficiente, o restante vira divida ativa de imposto.

## 15. Banco

A casa Banco permite acertar pendencias elegiveis com desconto de 20%. Esse desconto vale para:

- dividas ativas sem credor jogador, como banco, imposto e taxas de rodada;
- impostos pendentes.

Emprestimos entre jogadores nao entram no desconto do Banco.

Para usar o desconto da casa Banco, o jogador precisa estar em sua propria vez, posicionado na casa Banco e ter saldo suficiente para pagar o valor com desconto.

## 16. Emprestimo do Banco

O jogador pode solicitar emprestimo ao Banco. O valor recebido entra no saldo imediatamente, mas a divida registrada ja inclui juros de 20%.

Exemplo: um emprestimo de R$ 1.000 cria uma divida de R$ 1.200.

O Banco calcula limite de credito a partir do patrimonio em titulos e propriedades:

- limite base: R$ 5.000;
- a cada R$ 5.000 de patrimonio, o limite aumenta R$ 1.000.

O score bancario vai de 0 a 100 e cai conforme as dividas ativas se aproximam do limite de credito. Emprestimos que levariam o score a 0 sao bloqueados por risco de falencia.

Faixas de score:

- 81 a 100: Excelente.
- 61 a 80: Boa.
- 41 a 60: Atencao.
- 26 a 40: Risco.
- 11 a 25: Critico.
- 1 a 10: Pre-falencia.
- 0: Falencia.

## 17. Emprestimos entre Jogadores

Um jogador pode solicitar emprestimo a outro jogador ativo. O pedido fica pendente ate o jogador escolhido aceitar, recusar ou ate o solicitante cancelar.

Ao aceitar:

- o credor precisa ter saldo suficiente;
- o valor sai do saldo do credor;
- o valor entra no saldo do solicitante;
- uma divida ativa e criada para o solicitante;
- a mesma divida aparece como valor a receber para o credor.

Emprestimos entre jogadores nao possuem juros automaticos no estado atual. O valor a pagar e igual ao valor emprestado.

## 18. Pagamento de Dividas e Recebiveis

Dividas ativas podem ser pagas parcial ou totalmente. O pagamento reduz o saldo do devedor e reduz o valor restante da divida.

Se a divida possui credor jogador, o valor pago entra no saldo do credor e tambem atualiza o recebivel correspondente.

Quando a divida chega a zero, ela passa para o status pago. Um credor tambem pode perdoar uma divida a receber; nesse caso, a divida passa para perdoada e o valor restante deixa de ser cobrado.

## 19. Venda de Titulos ao Banco

O dono de um titulo pode vende-lo ao Banco. O valor de venda considera terreno mais construcoes, com valorizacao de 2% por rodada decorrida desde a rodada 1.

Ao vender ao Banco:

- o jogador recebe o valor calculado;
- o titulo fica sem dono;
- todas as propriedades daquele titulo sao removidas;
- a venda fica registrada no historico financeiro.

## 20. Venda Direta entre Jogadores

O dono pode criar uma proposta de venda de titulo para outro jogador ativo, informando o valor desejado.

O comprador pode aceitar ou recusar. Ao aceitar:

- o comprador precisa ter saldo suficiente;
- o valor sai do comprador;
- o valor entra para o vendedor;
- o titulo muda de dono;
- a rodada de aquisicao do titulo e atualizada para a rodada atual.

## 21. Leiloes de Titulos

O dono pode abrir um leilao para um titulo, definindo lance inicial.

Outros jogadores podem ofertar valores acima do lance inicial ou da maior oferta atual. O vendedor nao pode ofertar no proprio leilao, e o ofertante precisa ter saldo suficiente no momento do lance.

O vendedor pode fechar o leilao quando houver uma oferta. Ao fechar:

- o maior ofertante paga o valor ofertado;
- o vendedor recebe o valor;
- o titulo muda de dono;
- o leilao passa para fechado.

## 22. Eventos

Casas de Evento criam uma pendencia para o jogador da vez. Casas de Evento Global criam uma pendencia que afeta todos os jogadores ativos.

As cartas implementadas sao de sorte ou reves, com valores de R$ 1.000 ou R$ 1.500. A carta sorte adiciona saldo; a carta reves subtrai saldo. Quando um reves ultrapassa o saldo do jogador, o saldo nao fica negativo: ele para em zero.

A carta e escolhida de forma pseudoaleatoria a partir do horario, da casa e da rodada.

## 23. Acoes do Banqueiro

O Banqueiro pode aplicar credito ou debito manual no saldo de um jogador ativo, sempre informando um motivo.

Creditos aumentam saldo. Debitos reduzem saldo, mas nao podem deixar o saldo negativo. Todas as acoes manuais ficam registradas no historico financeiro do jogador.

## 24. Historico Financeiro

O jogo registra transacoes importantes, como:

- saldo inicial;
- creditos e debitos do Banco;
- emprestimos;
- pagamentos e recebimentos de dividas;
- impostos pagos e restituicoes;
- prestacao de contas;
- compra, venda, construcao e destruicao de propriedades;
- aluguel pago e recebido;
- dividas criadas;
- eventos.

O historico permite rastrear o motivo de cada alteracao financeira, a rodada em que ocorreu e, quando aplicavel, a casa ou jogador relacionado.

## 25. Pausar, Encerrar e Reiniciar

A partida pode ser pausada, encerrada ou reiniciada.

Pausar muda o status da partida para pausada. Encerrar muda a sala e o jogo para finalizados. Reiniciar volta a sala para aguardando, recria o estado inicial do jogo e devolve todos os jogadores ativos ao saldo inicial e a casa Inicio.

## 26. Controle de Balanceamento

Os valores centrais de balanceamento ficam reunidos em `GAME_BALANCE`. Essa configuracao controla saldo inicial, limites de jogadores, tamanho do tabuleiro, dados, slots de propriedade, juros, limite de credito, desconto do Banco, bonus de localidade, regras fiscais, valorizacao de venda ao Banco, bairros, propriedades, casas do tabuleiro e cartas de evento.

Alterar `GAME_BALANCE` propaga os novos valores para os calculos e para os textos dinamicos da interface que exibem percentuais de regra.
