// Teste do celular → carteiro → Yuh Extension (tudo de verdade, menos o Azure, simulado com dados FALSOS).
// Precisa do app do celular servido em http://localhost:8791 (pasta yuh-scanner-mobile).
const { chromium, devices } = require("playwright");
const path = require("path"), http = require("http");
const EXT = path.resolve(__dirname, "..");
const falhas = []; const confere = (n, ok, x = "") => { console.log((ok ? "  ok  " : "  FALHOU ") + n + (x ? " — " + x : "")); if (!ok) falhas.push(n); };

(async () => {
  // carteiro local (o mesmo worker.js que vai para a Cloudflare) com KV na memória
  const worker = (await import(path.join(EXT, "carteiro/worker.js"))).default;
  const kv = new Map(), env = { CAIXA: { get: async k => kv.has(k) ? kv.get(k) : null, put: async (k, v) => kv.set(k, v), delete: async k => kv.delete(k) } };
  const pacotes = [];
  const srv = http.createServer(async (q, r) => {
    const partes = []; for await (const c of q) partes.push(c);
    const corpo = Buffer.concat(partes);
    if (q.method === "POST") pacotes.push(corpo.toString());
    const resp = await worker.fetch(new Request("http://127.0.0.1:8793" + q.url, { method: q.method, headers: q.headers, body: ["GET", "HEAD", "OPTIONS"].includes(q.method) ? undefined : corpo }), env);
    r.writeHead(resp.status, Object.fromEntries(resp.headers)); r.end(Buffer.from(await resp.arrayBuffer()));
  }).listen(8793);

  const ctx = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker"); const id = sw.url().split("/")[2];
  let azure = 0;
  await ctx.route("http://127.0.0.1:8793/v1/ler", r => { azure++; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ readResult: { blocks: [{ lines: [
    { text: "CARTEIRA DE IDENTIDADE", boundingPolygon: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 20 }, { x: 0, y: 20 }], words: [] },
    { text: "Nome / Name", boundingPolygon: [{ x: 0, y: 40 }, { x: 300, y: 40 }, { x: 300, y: 60 }, { x: 0, y: 60 }], words: [] },
    { text: "CARLA MENDES ROCHA", boundingPolygon: [{ x: 0, y: 70 }, { x: 300, y: 70 }, { x: 300, y: 90 }, { x: 0, y: 90 }], words: [] }] }] } }) }); });

  const ext = await ctx.newPage(); await ext.goto(`chrome-extension://${id}/painel.html`);
  const erros = []; ext.on("pageerror", e => erros.push(e.message));
  await ext.evaluate(async () => chrome.storage.local.set({ config: { azurePonto: "https://yuh-teste.cognitiveservices.azure.com", azureChave: "a".repeat(32), carteiro: "http://127.0.0.1:8793", nomePc: "PC do balcão (teste)" } }));
  await ext.reload();
  confere("chip: nenhum celular", /Nenhum celular/.test(await ext.textContent("#chipCel")));
  await ext.click("#bCel");
  await ext.waitForSelector("#qr");
  const textoQr = await ext.evaluate(async () => (await import("./lib/celular.js")).textoDoQr("PC do balcão (teste)"));
  confere("QR leva para o app do celular", textoQr.startsWith("https://ryuuuuuki.github.io/yuh-scanner-mobile/#par="));
  // ---------- celular ----------
  const cel = await ctx.newPage({ ...devices["Pixel 7"] });
  await cel.setViewportSize({ width: 412, height: 860 });
  await cel.goto("http://localhost:8791/"); await cel.waitForTimeout(800);
  // dois documentos já digitalizados no celular (devem ir sozinhos quando conectar)
  await cel.evaluate(async () => {
    const b = await import("./js/banco.js");
    for (const [i, nome] of ["Doc A (teste)", "Doc B (teste)"].entries()){
      const c = document.createElement("canvas"); c.width = 900; c.height = 600; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 900, 600); g.fillStyle = "#000"; g.font = "40px sans-serif"; g.fillText(nome, 60, 120);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .9)); const pid = "pteste" + i;
      await b.guardarFoto(pid, blob);
      await b.salvarDoc({ id: "dteste" + i, nome, criado: Date.now(), paginas: [{ pid, cantos: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }], filtro: "original", rot: 0 }] });
    }
  });
  await cel.reload(); await cel.waitForTimeout(800);
  azure = 0;
  await cel.evaluate(t => window.__yuhQr(t), textoQr);
  await cel.waitForSelector("#telaCodigo .codigo", { timeout: 10000 });
  const codCel = (await cel.textContent("#telaCodigo .codigo")).trim();
  await ext.waitForSelector("#parBox .codigo", { timeout: 10000 });
  const codPc = (await ext.textContent("#parBox .codigo")).trim();
  confere("mesmo código nos dois", codCel === codPc && /^\d{4}$/.test(codPc), `${codCel} / ${codPc}`);
  confere("celular mostra o nome do PC", /PC do balcão \(teste\)/.test(await cel.textContent("#telaCodigo")));
  await cel.screenshot({ path: path.join(__dirname, "tela-cel-codigo.png") });
  await ext.screenshot({ path: path.join(__dirname, "tela-ext-codigo.png") });
  await cel.click("#cIgual");
  await cel.waitForSelector("#cOk", { timeout: 10000 });
  await ext.waitForFunction(() => /Android/.test(document.querySelector("#chipCel")?.textContent || ""), null, { timeout: 15000 });
  confere("extensão: conectado", true);
  confere("chip: nome do celular", /Celular: .*Android/.test(await ext.textContent("#chipCel")), await ext.textContent("#chipCel"));
  // ---------- os 2 que já estavam no celular chegam sozinhos ----------
  await cel.waitForFunction(() => /2 documentos enviados/.test(document.querySelector("#cEnvio")?.textContent || ""), null, { timeout: 20000 }).catch(() => {});
  confere("celular: mandou os 2 ao conectar", /2 documentos enviados/.test(await cel.textContent("#cEnvio")), await cel.textContent("#cEnvio"));
  await cel.screenshot({ path: path.join(__dirname, "tela-cel-conectado.png") });
  await ext.waitForFunction(() => document.querySelectorAll(".doc").length >= 2, null, { timeout: 30000 }).catch(() => {});
  confere("extensão: os 2 foram lidos e estão na lista", (await ext.$$(".doc")).length === 2 && azure === 2, `docs ${(await ext.$$(".doc")).length}, leituras ${azure}`);
  await ext.screenshot({ path: path.join(__dirname, "tela-ext-varios.png") });
  await cel.click("#cOk");
  // conectar de novo não manda de novo
  const antesPac = pacotes.length;
  await cel.evaluate(async () => { const p = await import("./js/ponte.js"); window.__x = p; });
  confere("já enviados ficam marcados", await cel.evaluate(async () => { const p = window.__x; const pc = p.pcs()[0]; return p.jaEnviado(pc, { id: "dteste0", alterado: (await (await import("./js/banco.js")).listarDocs()).find(d => d.id === "dteste0").alterado }); }));
  // ---------- mandar um documento ----------
  if (await ext.$("#vv")) await ext.click("#vv");
  await ext.waitForTimeout(300);
  azure = 0;
  const idPacote = await cel.evaluate(async () => {
    const p = await import("./js/ponte.js");
    const c = document.createElement("canvas"); c.width = 800; c.height = 500; const g = c.getContext("2d"); g.fillStyle = "#dfe"; g.fillRect(0, 0, 800, 500); g.fillStyle = "#000"; g.font = "40px sans-serif"; g.fillText("DOCUMENTO DE TESTE", 40, 100);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .9));
    return p.enviarAoPc(p.pcs()[0], "RG de teste", [blob, blob]);
  });
  confere("pacote enviado", !!idPacote);
  const pac = JSON.parse(pacotes[pacotes.length - 1]);
  confere("carteiro só vê pacote trancado", pac.tipo === "doc" && !!pac.dados && !/RG de teste|data:image/.test(pacotes[pacotes.length - 1]));
  await ext.waitForSelector(".campo input", { timeout: 25000 });
  const nome = await ext.$eval('.campo[data-k="nome"] input', e => e.value).catch(() => "");
  confere("chegou na extensão e foi lido (2 páginas)", azure === 2 && nome === "CARLA MENDES ROCHA", `leituras ${azure}, nome ${nome}`);
  const entregue = await cel.evaluate(async id => { const p = await import("./js/ponte.js"); return p.foiEntregue(p.pcs()[0], id); }, idPacote);
  confere("celular sabe que foi entregue", entregue);
  await ext.click("#vv"); await ext.waitForTimeout(300);
  confere("lista mostra 📱 celular", /📱 celular/.test(await ext.textContent("#corpo")));
  // ---------- celular estranho não entra ----------
  const antes = (await ext.$$(".doc")).length;
  await fetch(`http://127.0.0.1:8793/c/${await ext.evaluate(async () => (await chrome.storage.local.get("caixa")).caixa.canal)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "doc", de: "intruso", iv: "AAAAAAAAAAAAAAAA", dados: "AAAA" }) });
  await ext.waitForTimeout(6000);
  confere("pacote de celular desconhecido é ignorado", (await ext.$$(".doc")).length === antes);
  // ---------- tela do app: Salvar ou enviar tem a opção ----------
  confere("sem erros no painel", erros.length === 0, erros.join(" | "));
  await ext.screenshot({ path: path.join(__dirname, "tela-ext-lista.png") });
  console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join("; ")}` : "\nTUDO CERTO");
  await ctx.close(); srv.close(); process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
