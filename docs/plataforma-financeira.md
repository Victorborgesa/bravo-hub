# Plataforma financeira do Bravo Hub

Análise de outubro/2026 para transformar o Bravo Hub de um app que fala direto com os fabricantes em uma plataforma interna com central própria, carteira de créditos e tesouraria, no mesmo modelo que fal.ai, Replicate e Magnific usam por trás.

## Como os agregadores realmente funcionam

Quando alguém paga no fal.ai ou no Magnific, o dinheiro entra na conta da empresa e vira um saldo interno de créditos. A empresa mantém contas próprias em cada fabricante, pagas com o caixa dela, e cada geração do cliente desconta créditos internos enquanto a empresa paga o fabricante pelo consumo real. O dinheiro do cliente nunca é "transferido" para a chave do fabricante: são dois circuitos separados, ligados por um livro-razão e por um processo de tesouraria que mantém as contas dos fabricantes abastecidas.

O Bravo Hub vai seguir exatamente esse desenho, só que para uso interno: a Bravo é ao mesmo tempo a dona da central e a única cliente. Isso simplifica muito a parte fiscal (não há revenda) e permite um custo sem margem.

## Visão geral

A plataforma tem cinco peças. A **Central Bravo** é um servidor na nuvem que guarda as chaves de todos os fabricantes e é o único ponto que conversa com eles; os apps da equipe só falam com a Central, usando login. A **Carteira** é o saldo em reais da Bravo, com um livro-razão que registra cada centavo que entra e sai, e orçamentos por pessoa e por projeto. A **Tabela de preços** converte o consumo de cada fabricante (imagens, segundos de vídeo, tokens) em reais. A **Tesouraria** é o lugar único onde a Bravo coloca dinheiro e de onde saem os pagamentos para todos os fabricantes. A **Conciliação** compara, todo mês, o que a Carteira registrou com o que cada fabricante realmente cobrou.

O fluxo de uma geração fica assim: a pessoa clica em Gerar no app; o app manda o pedido para a Central com o token de login; a Central confere se a pessoa e o projeto têm saldo e orçamento, faz uma **reserva** do custo máximo estimado, chama o fabricante com a chave da Bravo, acompanha o job (mesmo que o app seja fechado), salva o resultado no armazenamento compartilhado, calcula o custo real e **captura** só esse valor, devolvendo a diferença da reserva. Se o fabricante falhar, a reserva é estornada inteira.

## A Central Bravo

A Central substitui a parte de "providers" que hoje roda dentro do app. Ela recebe pedidos padronizados (gerar imagem, gerar vídeo, upscale, texto), traduz para a API de cada fabricante e devolve um ID de job. Jobs longos, como vídeo, rodam no servidor: o app só acompanha o status e recebe o resultado pronto. Isso traz três ganhos imediatos: as chaves nunca saem do servidor, um vídeo não se perde se alguém fechar o notebook, e todos os resultados ficam numa biblioteca única da Bravo.

As chaves ficam no cofre de segredos do servidor, com acesso restrito aos administradores e rotação simples (trocar a chave em um lugar só vale para todo mundo). O login usa as contas Google da Bravo, então quem sai da empresa perde acesso ao ser removido do Google Workspace.

## Carteira e livro-razão

O saldo é mantido em **reais**, porque é a moeda em que a Bravo pensa e paga. Cada movimento é uma linha imutável no livro-razão, nunca um número sobrescrito: aporte (dinheiro que entrou), reserva, captura, estorno e ajuste de conciliação. O saldo de qualquer pessoa, projeto ou da empresa inteira é sempre a soma dessas linhas, o que torna impossível "sumir" dinheiro sem rastro e permite auditar qualquer mês passado.

Sobre a carteira da empresa ficam os **orçamentos**: limite mensal por pessoa, por projeto ou ambos, com alerta em 80% e bloqueio opcional em 100%. A reserva antes de cada geração impede que um lote grande estoure o orçamento no meio do caminho.

## Tabela de preços e câmbio

Cada modelo tem um preço em dólar por unidade (imagem, segundo, execução, milhão de tokens), versionado por data, para que uma mudança de preço do fabricante não altere o custo de gerações antigas. Sempre que o fabricante devolve o consumo exato (tokens no GPT Image 2.5, segundos no vídeo), a Central usa esse número, e não a estimativa.

A conversão para reais usa um **fator de custo efetivo**: câmbio do dia, mais o IOF de compras internacionais no cartão, hoje em 3,5% ([Arq Finance](https://arqfinance.com/articles/?p=2031), [Exiap](https://exiap.com.br/guias/calcular-iof-em-compra-internacional)), mais o spread do banco emissor. Como o spread varia, o fator é recalibrado todo mês na conciliação, comparando o que a Carteira registrou com a fatura real do cartão. Vale confirmar com o contador o tratamento do IOF e de tributos sobre importação de serviços para pessoa jurídica.

## Tesouraria: pagar em um lugar só

Este é o ponto central do pedido. Nenhum fabricante aceita receber saldo de outro sistema, então a "distribuição automática" é feita por um desenho de contas, e não por transferência entre fabricantes:

**Uma conta PJ dedicada à IA**, separada da conta principal da Bravo, com API de Pix. É o único lugar onde a Bravo coloca dinheiro.

**Um cartão corporativo virtual dessa conta**, cadastrado em todos os fabricantes. É ele que paga todo mundo. Plataformas como Conta Simples e Clara são exemplos de cartão corporativo virtual com controle de gastos no Brasil ([Jornal Contábil](https://jornalcontabil.com.br/noticia/quais-os-melhores-cartoes-corporativos-em-2026/amp/), [BP Money](https://bpmoney.com.br/?p=376296)); a escolha deve priorizar API de Pix, cartão internacional e bom spread cambial.

**Cada fabricante configurado para nunca precisar de ação manual sempre que possível.** Google e Replicate cobram depois do uso no cartão. A OpenAI tem recarga automática com limite mensal, que deve ser ligado junto ([TokenMix](https://tokenmix.ai/blog/openai-api-billing-explained), [How2Shout](https://www.how2shout.com/how-to/how-to-buy-openai-api-credits.html)). Kling vende pacotes de recurso da API, e BytePlus e MiniMax precisam ter a forma de cobrança verificada na abertura de cada conta; os que forem pré-pagos sem recarga automática ficam sob monitoramento da Tesouraria.

Dentro do app, a tela de Tesouraria mostra o saldo da conta IA, o saldo estimado em cada fabricante (último aporte menos o consumo registrado pela Central) e alertas de "saldo baixo" com botão que abre a página de recarga daquele fabricante. O botão **Adicionar saldo** gera uma cobrança Pix para a conta IA pela API do banco; quando o banco confirma o pagamento (webhook), a Carteira registra o aporte automaticamente. Para quem usa, a experiência é a de um agregador: paga em um lugar, usa todos os modelos.

## Conciliação e fechamento mensal

Todo mês a Central compara o livro-razão com o que cada fabricante cobrou. A OpenAI oferece uma API de custos por organização com detalhamento diário ([OpenAI Help](https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs), [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/completions_usage_api)). O Google permite exportar o faturamento para o BigQuery, com o consumo de IA identificado por SKU ([Google Cloud](https://docs.cloud.google.com/billing/docs/concepts), [Google Developers](https://discuss.google.dev/t/gcp-billing-export-to-bigquery-quick-guide-to-tracking-ai-costs/318584)). Para os demais, a conciliação é feita importando o extrato do painel de cada fabricante. Diferenças viram linhas de ajuste no livro-razão, e o fator de câmbio é recalibrado. O fechamento gera um relatório por projeto, útil para repassar custos de IA para orçamentos de clientes da Bravo.

## Segurança e governança

Dois papéis no início: administrador (gerencia chaves, aportes, orçamentos e pessoas) e membro (usa o app dentro do orçamento). Todo acesso e toda alteração de configuração ficam num registro de auditoria. As chaves dos fabricantes nunca chegam ao computador de ninguém. Backups diários do banco de dados e do livro-razão.

## Tecnologia recomendada

Supabase como base: banco Postgres (ideal para um livro-razão com transações), login com Google, armazenamento de arquivos para a biblioteca compartilhada, funções no servidor para a Central e tarefas agendadas para acompanhar jobs e conciliar. Começa no plano gratuito e o plano pago fica na casa dos US$ 25 por mês. O app desktop atual continua o mesmo por fora; por dentro, a camada de providers passa a chamar a Central em vez dos fabricantes.

## Roteiro

**Etapa 1, Central e login.** Servidor, login Google, chaves no cofre, proxy para o Google (Nano Banana e Veo) e jobs rodando no servidor. O app passa a usar a Central.

**Etapa 2, Carteira.** Livro-razão em reais, reservas e capturas, tabela de preços versionada, orçamentos por pessoa e projeto, painel do administrador.

**Etapa 3, demais fabricantes.** OpenAI, ByteDance, Kling, MiniMax e Replicate migrados para a Central, um por vez, cada um validado com chave real.

**Etapa 4, Tesouraria.** Conta IA, cartão virtual, aporte por Pix com confirmação automática, saldo estimado por fabricante e alertas.

**Etapa 5, Conciliação.** Importação de custos da OpenAI e do Google, extratos dos demais, ajustes, recalibragem do câmbio e relatório mensal por projeto.

**Etapa 6, colaboração.** Biblioteca compartilhada, spaces da equipe e projetos ligados a clientes.

## Decisões em aberto

Qual banco ou plataforma vai abrigar a conta e o cartão da IA. Quem serão os administradores. Se o orçamento será por pessoa, por projeto ou os dois. Se a Bravo já usa Google Workspace para o login. Se o custo de IA será repassado para os orçamentos de clientes, o que define o nível de detalhe dos relatórios por projeto.
