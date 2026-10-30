# Vídeo da Yuh Extension: material para a edição

Para quem for editar (Claude Code ou pessoa). O Iuri grava a tela e a narração seguindo o
roteiro abaixo; aqui estão as **cenas prontas em HTML** (abertura, capítulos, legendas,
destaques, avisos, animações explicativas e encerramento) e um script que transforma cada uma em vídeo.

- **Público:** colegas do cartório, sem conhecimento técnico. Fala informal, em português.
- **Duração alvo:** ~5 min, em 3 partes (Instalar · Usar no dia a dia · Celular).
- **Quadro:** 1920×1080, 30 fps.
- **Visual:** mesmas cores e fonte dos apps (Atkinson Hyperlegible; azul `#1F4FD1`, fundo `#1B222C`,
  verde `#4CC283` = certeza, amarelo `#E3A948` = conferir). O Kuru (`../img/kuru.gif`) é o mascote das esperas.

## Regras que não podem falhar

1. **A senha do cartório nunca aparece no vídeo.** Na cena 8, corte ou borre a caixinha enquanto ele cola.
   Se aparecer em qualquer quadro, borre.
2. **Nenhum dado real de cliente.** Só documentos de exemplo; se aparecer nome, CPF ou RG de alguém de
   verdade na gravação (lista do Yuh Scanner, site do VizWise, painel da Yuh), borre.
3. Não mostrar e-mails, chaves ou abas do Azure, Cloudflare ou Google AI Studio que estejam abertas no Chrome.

## Cenas prontas (`cenas/`)

Abra `previa.html` no navegador para ver todas animando. Os textos mudam pela URL (`?titulo=…`).

| Arquivo | Uso | Fundo | Duração |
|---|---|---|---|
| `abertura.html` | Início do vídeo | cheio | 4 s |
| `capitulo.html?n=1&titulo=Instalar&sub=…` | Antes de cada parte (1, 2, 3) | cheio | 3 s |
| `passo.html?n=4&texto=…&dica=…` | Legenda de baixo com o número do passo, por cima da gravação | **transparente** | 4 s |
| `destaque.html?x=…&y=…&w=…&h=…&texto=…&lado=baixo` | Anel pulsando + etiqueta num ponto da tela (x,y = centro em px do quadro) | **transparente** | 3 s |
| `aviso.html?tipo=cuidado\|ok\|info&titulo=…&texto=…` | Cartão no canto de cima, à direita | **transparente** | 5 s |
| `fluxo-documento.html` | Como funciona: documento → Yuh → formulário (verde/amarelo) | cheio | 7 s |
| `fluxo-celular.html` | Celular → PC, pacote trancado, código de 4 números | cheio | 6 s |
| `encerramento.html` | Resumo + link do celular | cheio | 5 s |

### Gerar os vídeos

```bash
npm i playwright   # se ainda não tiver; precisa também do ffmpeg
node render.cjs "cenas/passo.html?n=4&texto=Ligue o Modo do desenvolvedor&dica=Canto de cima, à direita" saida/passo-04.mov
node render.cjs "cenas/abertura.html" saida/abertura.mp4
node render.cjs "cenas/destaque.html?x=1650&y=110&w=320&h=70&texto=Modo do desenvolvedor" saida/destaque.png
```

- `.mov` = ProRes 4444 **com transparência** (sobreposições) · `.webm` = VP9 com transparência
- `.mp4` = sem transparência (cenas cheias) · `.png` = um quadro (`--quadro 2.5` escolhe o instante)
- `--segundos N` muda a duração; o padrão é a duração da cena. O tempo das animações é controlado
  quadro a quadro, então o resultado é sempre igual.
- Os `x,y` do `destaque` dependem da gravação: meça na própria gravação (1920×1080) antes de gerar.

## Roteiro → o que pôr em cada cena

A coluna "Sobreposição" é sugestão de edição; a fala é a do Iuri (roteiro completo em `roteiro.md`).

| Cena | Na tela (gravação) | Sobreposição |
|---|---|---|
| — | — | `abertura` (4 s) |
| 1 | Iuri / Yuh Scanner | `fluxo-documento` (por cima da fala de apresentação) |
| — | — | `capitulo` n=1 "Instalar" / "Uma vez só, em cada computador" |
| 2 | Aviso "Atualizar para 0.8.0" | `passo` 1 "Atualize o Yuh Scanner para a 0.8.0" + `destaque` no aviso |
| 3 | Botão da versão → "Instalar a Yuh Extension no Chrome" | `passo` 2 "Botão da versão → Instalar no Chrome" + `destaque` no botão |
| 4 | chrome://extensions | `passo` 3 "Ligue o Modo do desenvolvedor" (dica "Canto de cima, à direita") + `destaque` |
| 5 | Yuh Scanner, "Copiar caminho" | `passo` 4 "Copie o caminho da pasta" |
| 6 | "Carregar sem compactação" → colar → "Selecionar pasta" | `passo` 5 "Carregar sem compactação e escolher a pasta" + `destaque` no botão |
| 7 | Quebra-cabeça → fixar → abrir a Yuh | `passo` 6 "Fixe a Yuh no quebra-cabeça" |
| 8 | Caixinha "Senha do cartório" | `passo` 7 "Cole a senha do cartório" + `aviso` cuidado "Não mostre a senha" / "Ela vai separada, pelo WhatsApp." **+ BORRAR a caixinha** |
| 9 | ⚙, nome do PC | `passo` 8 "Dê um nome ao computador" (dica "Ex.: Balcão 2") |
| 10 | Painel pronto | `aviso` ok "Pronto!" / "Daqui pra frente ela se atualiza sozinha." |
| — | — | `capitulo` n=2 "Usar no dia a dia" / "Ler um documento e preencher o site" |
| 11 | Digitalizar no Yuh Scanner | — |
| 12 | "Importar do Yuh Scanner" → "Na tela do Yuh Scanner agora" | `destaque` no botão Importar |
| 13 | Kuru lendo → ficha | — |
| 14 | Campo amarelo na ficha | `destaque` no campo amarelo, texto "Amarelo = confira" |
| 15 | "Importar documentos" | `passo` "PDF ou foto? Importar documentos" |
| 16 | Formulário do site → "Preencher este formulário" | `destaque` no botão |
| 17 | Campos verde/amarelo | `aviso` info "Site novo" / "A IA vê só o nome dos campos, nunca os dados do cliente." |
| 18 | "O que foi em cada campo" | `passo` "Errou um campo? Troque aqui e ela aprende" |
| 19 | Mouse no Enviar do site, sem clicar | `aviso` ok "A Yuh nunca envia" / "Quem confere e clica em Enviar é sempre você." |
| — | — | `capitulo` n=3 "Celular" / "Conectar e mandar documentos" |
| 20 | Link do app no celular | `passo` "Abra o link e adicione à tela inicial" |
| 21 | Ícone de celular na Yuh → QR | `destaque` no ícone de celular |
| 22 | Ícone de QR no celular | `passo` "No celular: ícone de QR, lá em cima" |
| 23 | Os 4 números | `fluxo-celular` (por cima da fala) |
| 24 | "Conectado!" + documentos chegando | `aviso` ok "Conectado" / "O que já estava no celular vem sozinho." |
| 25 | "Salvar ou enviar → Levar para o formulário no PC" | `passo` "Depois: Salvar ou enviar → Levar para o formulário no PC" |
| 26 | Documento com etiqueta "celular" | — |
| 27 | Fechamento | `encerramento` (5 s) |

## Dicas de edição

- A gravação de tela do Chrome costuma ter letra pequena: dê **zoom** (1,3× a 1,6×) na região do clique
  das cenas 4, 6, 7, 12, 16 e 21, antes de aplicar o `destaque`.
- Corte as esperas longas (download, leitura); deixe ~1 s do Kuru girando para mostrar que está trabalhando.
- Legenda da narração (opcional) em cima da faixa do `passo`, nunca cobrindo o que está sendo clicado.
- Música, se tiver, bem baixa (−24 dB sob a voz).
