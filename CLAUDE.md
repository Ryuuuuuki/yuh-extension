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
- Mapeamento de campos: memória do site (`mapas` por `chaveDoSite`) → dicionário (`lib/campos.js`) → Gemini grátis
  (`lib/gemini.js`, só rótulos; nunca dados — o teste falha se algum dado de cliente for na requisição).
- `pagina/pagina.js` é injetado em todos os quadros (iframes); usa o setter nativo + eventos input/change (React/Angular).
- **Nunca enviar formulário / clicar botões.** Documentos somem em 24 h.

## Testes
`node testes/e2e.cjs` (Playwright, `channel: "chromium"` headless com a extensão; servidor local na porta 8792).
O painel aceita `?aba=<tabId>` só para os testes (no uso real ele pega a aba ativa).

## Próximas etapas
- "Importar do Yuh Scanner" (precisa de um endpoint no app Windows) e conexão com o celular (relay Cloudflare + QR).
- PDF na importação; QR Code da CNH digital/CIN; leitura de vários documentos por pessoa (comprador/vendedor).
- Testar em sites reais do cartório (o Iuri vai dizendo quais).
