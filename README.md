# Yuh Extension

Extensão do Chrome que **lê documentos** (RG/CIN, CNH, certidão) e **preenche formulários de sites**,
sem precisar ensinar site por site. Nunca envia nada sozinha: quem confere e envia é você.

Projeto irmão do [Yuh Scanner](https://github.com/Ryuuuuuki/yuh-scanner) (Windows) e do
[Yuh Scanner Mobile](https://github.com/Ryuuuuuki/yuh-scanner-mobile).

## Como funciona

1. **Importar documentos**: escolha a foto do documento (frente e verso juntas). A foto é lida pelo
   **Microsoft Azure** (plano grátis F0: até 5000 leituras/mês; a extensão trava em 4500).
2. **Ficha**: a Yuh mostra os dados. Verde = lido com segurança, amarelo = confira. Dá para corrigir.
3. **Preencher este formulário**, com o site aberto na aba:
   - a Yuh lê a **planta** do formulário: rótulos, tipos e opções. Ela não lê o que está digitado;
   - descobre o que vai em cada campo: primeiro pelo que já **aprendeu** daquele site, depois por um
     **dicionário** próprio e, só para o que sobrar, pela **IA (Gemini, grátis)**, que recebe
     **apenas os nomes dos campos**, nunca dados de clientes;
   - preenche e pinta os campos de verde/amarelo;
   - em "O que foi em cada campo" dá para corrigir, e a Yuh **aprende** para aquele site.

## Instalar (modo desenvolvedor)

1. Descompacte o `.zip` numa pasta fixa (ex.: `Documentos\Yuh Extension`).
2. No Chrome: `chrome://extensions` → ligue **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolha a pasta.
4. Fixe o ícone azul da Yuh na barra (ícone de quebra-cabeça → alfinete).
5. Clique no ícone → ⚙ → cole o **ponto de extremidade** e a **CHAVE 1** do Azure
   (portal.azure.com → recurso `yuh-leitura-iuri` → Chaves e Ponto de extremidade). A chave do Gemini é opcional.

Para atualizar: troque os arquivos da pasta e clique em ↻ no cartão da extensão em `chrome://extensions`.

## Privacidade

- As chaves, os documentos e o que a Yuh aprendeu dos sites ficam **só neste Chrome** (`chrome.storage.local`).
- Os documentos **somem sozinhos em 24 h** (e há "Apagar" no documento e na ⚙).
- Foto → Microsoft (só para ler o texto). Nomes dos campos dos sites → Google Gemini. Nada mais sai do PC.

## Testes

`node testes/e2e.cjs`: abre o Chromium com a extensão, simula o Azure e o Gemini com **dados falsos** e
preenche 4 sites de teste (`testes/sites/`): um portal moderno, uma tabela antiga, um site em React com
iframe e um formulário de rótulos estranhos (que precisa da IA). O teste também confere a memória por site,
a correção ensinada e que nenhum formulário foi enviado.
