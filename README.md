# Bravo Hub

Hub desktop de inteligências artificiais da Bravo Visuals. Reúne geração de imagem, vídeo e upscale num canvas de nodes (no estilo do Spaces) e chama cada modelo direto pela API oficial do fabricante, sem intermediários.

## O que já tem

O canvas tem sete nodes: Texto, Lista (gera um resultado por item), Assistente (cria e refina prompts, descreve imagens, sugere variações), Upload, Gerador de imagem, Gerador de vídeo e Upscale. As portas são tipadas (texto, imagem e vídeo), então só dá pra ligar o que combina. Cada node roda sozinho, até ele, a partir dele ou o fluxo inteiro.

No canvas: botão direito (ou a tecla N) abre o menu de inserção com busca; arrastar com o botão esquerdo seleciona vários nodes; o botão do meio, o direito ou a barra de espaço movem a tela; imagens arrastadas do Windows Explorer ou coladas com Ctrl+V viram um node de upload. Atalhos: Ctrl+Z/Ctrl+Shift+Z desfazem e refazem, Ctrl+D duplica, Ctrl+A seleciona tudo, Delete exclui, V e H trocam entre seleção e mão, Shift+1 enquadra tudo. Clicar duas vezes num gerador abre o painel lateral de configurações.

Fabricantes conectados: Google (Nano Banana Pro, Nano Banana 2.1, Veo 3.1, Gemini), OpenAI (GPT Image 2.5, GPT), ByteDance pela BytePlus ModelArk (Seedream 5.0, Seedance 2.0), Kling (3.0), MiniMax (H3, Image-01) e Replicate (Clarity Upscaler). A opção Auto escolhe o modelo sozinho. A lista fica em `src/providers/catalog.ts`, e o ID de API de cada modelo também pode ser corrigido no próprio app, em Ajustes > Modelos.

Tudo que é gerado fica salvo no computador, na pasta de dados do app, e aparece na Biblioteca. O painel de Custos estima o gasto por modelo e por fabricante e compara com o valor da assinatura que você informar.

As chaves de API ficam no cofre do Windows (Credential Manager), nunca no código nem em arquivo.

## Instalar no Windows

Na aba **Actions** do GitHub, abra o fluxo **Instalador Windows** e clique em **Run workflow**. Quando terminar, baixe o artefato `bravo-hub-windows`, que traz o instalador `.exe` e o `.msi`. Para publicar uma versão oficial, crie uma tag como `v0.1.0`: o mesmo fluxo monta uma release em rascunho com os instaladores.

Depois de instalar, abra **Ajustes** e cole as chaves de cada fabricante.

## Desenvolver

Precisa de Node 22+, Rust estável e, no Windows, do WebView2 (já vem no Windows 11).

```bash
npm install
npm run tauri dev     # app desktop com recarga automática
npm run dev           # só a interface no navegador (as APIs não funcionam por CORS)
npm run tauri build   # gera o instalador localmente
```

## Estrutura

`src/providers/` tem uma integração por fabricante, `src/canvas/` tem o canvas, os nodes e o motor que executa o fluxo, `src/views/` tem as telas e `src-tauri/` tem a parte nativa em Rust (cofre de chaves, disco, HTTP). O plano completo está em `docs/arquitetura.md`.
