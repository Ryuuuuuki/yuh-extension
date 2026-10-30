// Teste da central do cartório: extensão SEM chave nenhuma → lê e usa a IA pelo carteiro
// (o mesmo worker.js, rodando aqui com KV na memória; Azure e Gemini de mentira).
const { chromium } = require("playwright");
const path = require("path"), http = require("http");
const EXT = path.resolve(__dirname, "..");
const falhas = []; const confere = (n, ok, x = "") => { console.log((ok ? "  ok  " : "  FALHOU ") + n + (x ? " — " + x : "")); if (!ok) falhas.push(n); };

(async () => {
  const worker = (await import(path.join(EXT, "carteiro/worker.js"))).default;
  const { CODIGO } = await import(path.join(EXT, "lib/codigo-cartorio.js")).catch(() => ({}));
  if (!CODIGO){ console.log("sem lib/codigo-cartorio.js — nada a testar"); process.exit(1); }
  const kv = new Map(), env = { CAIXA: { get: async k => kv.has(k) ? kv.get(k) : null, put: async (k, v) => kv.set(k, v), delete: async k => kv.delete(k) },
    CODIGO, AZURE_PONTO: "https://azure.falso", AZURE_CHAVE: "chave-da-central", GEMINI_CHAVE: "gemini-da-central" };
  const fora = []; const fetchReal = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    u = String(u); fora.push({ u, h: o?.headers || {} });
    if (u.startsWith("https://azure.falso/")) return new Response(JSON.stringify({ readResult: { blocks: [{ lines: [
      { text: "CARTEIRA DE IDENTIDADE", boundingPolygon: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 20 }, { x: 0, y: 20 }], words: [] },
      { text: "Nome / Name", boundingPolygon: [{ x: 0, y: 40 }, { x: 300, y: 40 }, { x: 300, y: 60 }, { x: 0, y: 60 }], words: [] },
      { text: "CARLA MENDES ROCHA", boundingPolygon: [{ x: 0, y: 70 }, { x: 300, y: 70 }, { x: 300, y: 90 }, { x: 0, y: 90 }], words: [] }] }] } }), { status: 200 });
    if (u.startsWith("https://generativelanguage.googleapis.com/")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"c1":"nome"}' }] } }] }), { status: 200 });
    return fetchReal(u, o);
  };
  const srv = http.createServer(async (q, r) => {
    const partes = []; for await (const c of q) partes.push(c);
    const resp = await worker.fetch(new Request("http://127.0.0.1:8794" + q.url, { method: q.method, headers: q.headers, body: ["GET", "HEAD", "OPTIONS"].includes(q.method) ? undefined : Buffer.concat(partes) }), env);
    r.writeHead(resp.status, Object.fromEntries(resp.headers)); r.end(Buffer.from(await resp.arrayBuffer()));
  }).listen(8794);

  const ctx = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker"); const id = sw.url().split("/")[2];
  let direto = 0;
  await ctx.route(/cognitiveservices\.azure\.com|generativelanguage\.googleapis\.com/, r => { direto++; r.abort(); });
  const ext = await ctx.newPage(); await ext.goto(`chrome-extension://${id}/painel.html`);
  const erros = []; ext.on("pageerror", e => erros.push(e.message));
  await ext.evaluate(async () => chrome.storage.local.set({ config: { carteiro: "http://127.0.0.1:8794" } }));   // nenhuma chave
  await ext.reload(); await ext.waitForTimeout(500);
  confere("sem aviso de 'falta configurar'", !/Falta configurar/.test(await ext.textContent("body")));
  await ext.setInputFiles("#arq", path.join(__dirname, "foto.jpg"));
  await ext.waitForSelector(".campo input", { timeout: 20000 });
  const nome = await ext.$eval('.campo[data-k="nome"] input', e => e.value).catch(() => "");
  const az = fora.filter(f => f.u.startsWith("https://azure.falso/"));
  confere("leu pela central (chave da central)", nome === "CARLA MENDES ROCHA" && az.length === 1 && az[0].h["Ocp-Apim-Subscription-Key"] === "chave-da-central", `nome ${nome}, azure ${az.length}`);
  confere("nada foi direto do PC para Azure/Gemini", direto === 0);
  confere("uso do mês contado na central", (await (await worker.fetch(new Request("http://x/v1/uso", { headers: { "X-Yuh-Codigo": CODIGO } }), env)).json()).leituras === 1);
  const ia = await ext.evaluate(async () => { const g = await import("./lib/gemini.js"); return { tem: await g.temIA(), mapa: await g.mapearComIA([{ id: "c1", rotulo: "Nome completo", tipo: "text" }], ["nome"], ["CARLA MENDES ROCHA"]) }; });
  const ge = fora.filter(f => f.u.startsWith("https://generativelanguage"));
  confere("IA pela central (chave da central)", ia.tem && ia.mapa.c1 === "nome" && ge.length === 1 && ge[0].h["x-goog-api-key"] === "gemini-da-central", JSON.stringify(ia));
  // código errado → mensagem clara
  env.CODIGO = "outro";
  await ext.click("#vv").catch(() => {}); await ext.waitForTimeout(300);
  await ext.setInputFiles("#arq", path.join(__dirname, "foto.jpg"));
  await ext.waitForSelector(".erro", { timeout: 15000 });
  confere("código errado: avisa para atualizar", /Atualize a Yuh Extension/.test(await ext.textContent(".erro")), await ext.textContent(".erro"));
  confere("sem erros no painel", erros.length === 0, erros.join(" | "));
  console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join("; ")}` : "\nTUDO CERTO");
  await ctx.close(); srv.close(); process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
