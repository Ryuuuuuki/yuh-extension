# Yuh Extension — notas para o Claude

Projeto do Iuri (GitHub `Ryuuuuuki`). Conversa em português, informal, explicações simples, sem jargão.
**Na interface, sempre perguntar os detalhes visuais antes de mudar** (pedido dele). Ele gosta de protótipo em HTML.
Protótipo aprovado: `yuh-scanner-mobile/docs/prototipo-yuh-extension.html` (Kuru Kuru nas esperas).

## O que é
Chrome MV3, painel lateral (`painel.html/js/css`), sem build. Lê documento → ficha → preenche formulário de qualquer site.
- Leitura: **Azure AI Vision** (Image Analysis 4.0 `features=read`), plano **F0** no recurso `yuh-leitura-iuri` (East US,
  grupo `yuh-scanner`, assinatura pay-as-you-go do Iuri). Trava de 4500/mês em `lib/banco.js`; alerta de gasto R$1 no Azure.
  O Google Vision foi abandonado (exigia pré-pagamento de R$150). Tesseract local foi testado e é fraco para identidades.
- `lib/ler.js` = o "entendedor" de texto (RG/CIN/CNH/certidão). **Cópia** de `yuh-scanner-mobile/docs/teste-leitura/ler.js`:
  mudou um, copie para o outro.
- `lib/ficha.js` desmembra (SSP/BA → orgao + orgaoUf; "GUARULHOS, SP" → naturalidade + natUf; CIN: rg = CPF).
- Mapeamento: memória do site (`mapas` por `chaveDoSite`, só guarda IA e correções; versão em `mapasVersao`) → em site novo com IA ligada, o **Gemini mapeia o formulário inteiro** (onde concorda com o dicionário fica verde) → senão dicionário (`lib/campos.js`) + Gemini só nos desconhecidos
  (`lib/gemini.js`). A IA tem autonomia: recebe a estrutura (rótulo, seção, ajuda, opções, posição) e devolve uma **receita** por campo ("cpf", "{orgao}/{orgaoUf}", "=CPF", "-"); a Yuh monta o valor com os dados locais (`valorDaReceita` em `lib/ficha.js`). Nunca vão dados: textos com valores da ficha viram "(oculto)" e números longos viram "#" — o teste falha se algum dado de cliente for na requisição.
- **Importar do Yuh Scanner** (`lib/yuhpc.js`): ponte do app Windows ≥0.8 em `127.0.0.1:47321`, cabeçalho `X-Yuh-Extensao: 1`; lista o que está no grid agora (`/v1/atual`, sem salvar) e o salvo nas últimas 24 h. **PDF** (`lib/pdf.js`, pdf.js 4.10 em `lib/pdfjs/`, até 4 páginas).
- **Celular** (`lib/celular.js` + `lib/cripto.js`): caixa no carteiro (Cloudflare Worker + KV, `carteiro/worker.js`), QR = link do app com #par=, código de 4 números, pacotes trancados; celular desconhecido é ignorado. Teste: `node testes/celular.cjs` (app do celular em localhost:8791).
- `pagina/pagina.js` é injetado em todos os quadros (iframes); usa o setter nativo + eventos input/change (React/Angular).
- **Nunca enviar formulário / clicar botões.** Documentos somem em 24 h. Campos cobertos por outra janela (tela de fundo atrás de diálogo, mesmo em iframes) são ignorados.
- Sistema real testado: **VizWise** (Cadastro de Firma, iframes aninhados, rótulo depois da caixa, "Filiação 1/2", seletor CPF/CNPJ). Imitação em `testes/sites/vizwise.html`.

## Testes
`node testes/e2e.cjs` (Playwright, `channel: "chromium"` headless com a extensão; servidor local na porta 8792).
O painel aceita `?aba=<tabId>` só para os testes (no uso real ele pega a aba ativa).

## Próximas etapas
- Carteiro publicado (out/2026): worker `yuh-carteiro` em https://yuh-carteiro.iuripsiqueira.workers.dev, KV `yuh-caixa` ligado como `CAIXA` (conta Cloudflare do Iuri). Para atualizar: Cloudflare → Workers → yuh-carteiro → Edit code → colar `carteiro/worker.js` → Deploy.
- **Central do cartório** (0.4.0): sem chave na ⚙, a leitura e a IA vão pelo carteiro (`lib/central.js` → `/v1/ler`, `/v1/ia/<modelo>`, `/v1/uso`), que guarda as chaves como segredos do worker (`CODIGO`, `AZURE_CHAVE`, `GEMINI_CHAVE`; variável `AZURE_PONTO`; trava única do cartório `LIMITE_MES`=4500 no KV `uso:AAAA-MM`). Desde 0.5.0 a central é SEMPRE usada quando há código; a ⚙ não mostra chaves (só "✓ Usando a central · N de 4500" + nome do PC + privacidade) e chaves antigas guardadas no PC são apagadas ao abrir o painel. Só uma cópia sem `codigo-cartorio.js` mostra os campos de chave (uso direto). O código do cartório fica em `lib/codigo-cartorio.js`, **fora do git** (repo público): tem que ir no zip/pacote da loja e ser igual ao segredo `CODIGO`. Se perder o arquivo, gere outro código e troque o segredo. Teste: `node testes/central.cjs`.
- Celular ≥1.3.0 manda sozinho, ao conectar, tudo que ainda não foi para este PC; o painel lê vários em fila (`receberVariosDoCelular`).
- Testar celular de verdade (Android e iPhone).
- QR Code da CNH digital/CIN; leitura de vários documentos por pessoa (comprador/vendedor).
- Testar em sites reais do cartório (o Iuri vai dizendo quais).
