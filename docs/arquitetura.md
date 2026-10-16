# Arquitetura inicial

## Referência analisada

O app desktop do Magnific é uma casca Tauri 2 (Rust + WebView2) que carrega `https://www.magnific.com`. A interface e o Spaces vivem no site. A parte nativa acrescenta downloads, sincronização de pasta local, abertura de imagens e designs locais, notificações de jobs, exportação de vídeo com ffmpeg, atalhos, login por deep link e atualização automática.

O Bravo Hub reconstrói o comportamento a partir da documentação pública e do uso, com código, nome e identidade visual próprios da Bravo.

## Stack

Tauri 2 + React + TypeScript, com React Flow pro canvas de nodes. Instalador leve pro Windows e atualização automática pela própria Tauri.

## Provedores (API oficial de cada fabricante)

Google (Veo, Nano Banana), OpenAI (GPT Image, Sora), Kling, BytePlus (Seedream, Seedance), Black Forest Labs (Flux) e Replicate (Clarity Upscaler). O assistente de prompt usa um LLM configurável.

## Chaves e custos

Fase 1, uso individual: chaves guardadas no cofre do sistema operacional (Windows Credential Manager), nunca no código.

Fase 2, time da Bravo: um servidor da Bravo guarda as chaves, faz o login e registra o gasto por usuário. O app conversa só com esse servidor.

Desde o início, cada geração registra o custo estimado, pra comparar com a assinatura do Magnific.

## Escopo da v1

Canvas de nodes com portas tipadas, nodes de texto/assistente, imagem, vídeo, upscale, upload e lista (geração em lote), histórico local e painel de custos. Ficam pra depois a sincronização na nuvem, o node Designer e a colaboração.

## Estado da v0.1

Feito: canvas com os sete nodes, integrações com os seis fabricantes, armazenamento local das mídias, Biblioteca, painel de Custos, cofre de chaves e instalador do Windows pelo GitHub Actions.

Ainda não validado com chaves reais: as chamadas seguem a documentação pública de cada API, mas nenhuma foi testada de ponta a ponta. Os IDs de modelo mudam com frequência; quando um fabricante recusar um ID, atualize `src/providers/catalog.ts`.

Próximos passos: validar cada fabricante com as chaves da Bravo, atualização automática (precisa de uma chave de assinatura do updater), logo oficial em vetor, node Designer, exportação de vídeo com ffmpeg e o servidor da Bravo para login e chaves compartilhadas.
