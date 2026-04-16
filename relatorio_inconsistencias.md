# Relatório de Análise de Inconsistências: Base de Inventário OOH

## 1. Visão Geral do Problema
Durante a auditoria dos dados importados para o OOH Planner, identificamos uma falha estrutural na forma como a base de inventário (planilha Excel) está sendo preenchida. 

Existe um conflito direto entre a **Intenção de Compra** (coluna `quantidade` / TT Faces) e a **Regra Comercial do Veículo** (coluna `range_minimo` / MIN). Em centenas de casos, a quantidade de faces que a equipe planeja comprar é estritamente menor do que o pacote mínimo que o exibidor exige para vender.

## 2. Onde está o erro na origem dos dados?
O erro ocorre no momento do preenchimento da planilha mestre de inventário. Quem está inserindo os dados está alocando volumes de faces sem cruzar essa informação com as regras de comercialização dos fornecedores.

**Exemplo prático do erro:**
A equipe preencheu na planilha que deseja comprar **1 face** de Painel de Led da Eletromidia em Belém. No entanto, na mesma planilha, a regra comercial da Eletromidia (o `range_minimo`) dita que eles só vendem pacotes a partir de **6 faces**. 

Como é impossível comprar 1 face de um fornecedor que exige a compra mínima de 6, o dado nasce inconsistente.

## 3. Impacto Prático na Operação
Se esses dados passassem despercebidos para a ponta da operação, teríamos dois grandes problemas:
1. **Orçamento Irreal (Falso Positivo):** O plano de mídia calcularia o custo para apenas 1 face. Na hora de executar a compra, o custo real seria 6x maior (pois o veículo obrigará a compra do pacote de 6).
2. **Propostas Recusadas:** Os pedidos de inserção seriam travados pelos exibidores por não atingirem o volume mínimo (teto de entrada) da praça.

## 4. Raio-X das Inconsistências
Encontramos **563 linhas** na base de dados apresentando esse exato problema.

### Top 5 Praças com mais erros de preenchimento
| Praça | Qtd. de Inconsistências |
|-------|-------------------------|
| Belém | 59 |
| Cuiabá | 43 |
| Porto Alegre | 38 |
| Manaus | 34 |
| Salvador | 34 |

### Top 5 Exibidores Afetados pelo erro
| Exibidor | Qtd. de Inconsistências |
|----------|-------------------------|
| Kallas | 34 |
| Sinergy | 30 |
| Brasil Midia Exterior | 18 |
| Rio Verde | 18 |
| Bandeirantes | 17 |

### Amostra Real da Base (Como está preenchido hoje)
| Praça | Exibidor | Formato | TT Faces (O que tentaram comprar) | MIN (O que o veículo exige) |
|-------|----------|---------|-----------------------------------|-----------------------------|
| Belém | Eletromidia | Painel de Led | **1** | **6** |
| Belém | WeOOH | Painel de Led | **1** | **6** |
| Belém | Brasil Midia Exterior | Painel de Led | **1** | **6** |
| Belém | Brasil Midia Exterior | Frontlight | **1** | **4** |
| Belém | Ultra OOH | Painel de Led | **1** | **6** |

## 5. Solução Aplicada no Sistema
Para proteger a operação e evitar que planos de mídia financeiramente inviáveis sejam gerados, **o OOH Planner foi atualizado para corrigir essa divergência automaticamente na interface**. 

Sempre que o planejador carregar uma dessas linhas na tela, o sistema vai ignorar a "quantidade errada" da base e forçará o campo `TT Faces` a assumir o valor do `MIN` (ex: subindo automaticamente de 1 para 6). Assim, o orçamento refletirá a realidade comercial exigida pelo fornecedor.

## 6. Próximos Passos Recomendados
Apesar da plataforma agora possuir uma trava de segurança que corrige o problema visualmente e financeiramente, o dado na raiz continua errado. 

Recomendamos que a equipe responsável pela montagem da planilha Excel:
1. Revise as 563 linhas afetadas.
2. Alinhe a coluna de `quantidade` para que ela seja **sempre maior ou igual** à coluna `range_minimo`.
3. Valide com os exibidores (especialmente Kallas e Sinergy) se os pacotes mínimos informados estão corretos para as praças em questão.