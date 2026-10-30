// teste do carteiro com um KV de mentira (node teste-worker.mjs)
import w from "./worker.js";
const kv = new Map();
const env = { CAIXA: { get: async k => kv.has(k) ? kv.get(k) : null, put: async (k, v) => kv.set(k, v), delete: async k => kv.delete(k) } };
const ir = (m, p, body) => w.fetch(new Request("https://c.test" + p, { method: m, body, headers: body ? { "Content-Type": "application/json" } : {} }), env);
const ok = (n, c) => { console.log((c ? "  ok  " : "  FALHOU ") + n); if (!c) process.exitCode = 1; };
const canal = "AbCdEfGhIjKlMnOpQrStUv";
ok("status", (await (await ir("GET", "/")).json()).ok);
ok("canal inválido", (await ir("GET", "/c/curto")).status === 404);
ok("pacote inválido", (await ir("POST", "/c/" + canal, "{}")).status === 400);
const { id } = await (await ir("POST", "/c/" + canal, JSON.stringify({ tipo: "doc", de: "cel1", dados: "xyz" }))).json();
ok("guardou", !!id);
ok("lista", (await (await ir("GET", "/c/" + canal)).json()).ids[0] === id);
ok("existe", (await (await ir("GET", `/c/${canal}/${id}?so=existe`)).json()).existe === true);
ok("pega", (await (await ir("GET", `/c/${canal}/${id}`)).json()).dados === "xyz");
ok("cors", (await ir("GET", "/c/" + canal)).headers.get("access-control-allow-origin") === "*");
await ir("DELETE", `/c/${canal}/${id}`);
ok("apagou", (await (await ir("GET", `/c/${canal}/${id}?so=existe`)).json()).existe === false && (await (await ir("GET", "/c/" + canal)).json()).ids.length === 0);
ok("grande demais", (await ir("POST", "/c/" + canal, JSON.stringify({ tipo: "doc", de: "x", d: "a".repeat(21 * 1024 * 1024) }))).status === 413);

// ---------- central do cartório ----------
const env2 = { ...env, CODIGO: "codigo-de-teste-123", AZURE_PONTO: "https://azure.falso/", AZURE_CHAVE: "k-azure", GEMINI_CHAVE: "k-gemini", LIMITE_MES: "2" };
const chamadas = [];
globalThis.fetch = async (u, o) => { chamadas.push({ u: String(u), h: o.headers }); return new Response(JSON.stringify({ readResult: { blocks: [] }, candidates: [] }), { status: 200 }); };
const ir2 = (m, p, body, cod = "codigo-de-teste-123") => w.fetch(new Request("https://c.test" + p, { method: m, body, headers: cod ? { "X-Yuh-Codigo": cod } : {} }), env2);
ok("central: sem código → 401", (await ir2("POST", "/v1/ler", "x", "")).status === 401);
ok("central: código errado → 401", (await ir2("POST", "/v1/ler", "x", "errado")).status === 401);
ok("central: lê pelo Azure com a chave de lá", (await ir2("POST", "/v1/ler", "foto")).status === 200 && chamadas[0].u.startsWith("https://azure.falso/computervision/") && chamadas[0].h["Ocp-Apim-Subscription-Key"] === "k-azure");
await ir2("POST", "/v1/ler", "foto");
ok("central: conta o uso do mês", (await (await ir2("GET", "/v1/uso")).json()).leituras === 2);
ok("central: trava do mês", (await ir2("POST", "/v1/ler", "foto")).status === 429 && chamadas.length === 2);
ok("central: IA pelo Gemini com a chave de lá", (await ir2("POST", "/v1/ia/gemini-2.5-flash", "{}")).status === 200 && /models\/gemini-2.5-flash:generateContent/.test(chamadas[2].u) && chamadas[2].h["x-goog-api-key"] === "k-gemini");
ok("central: modelo estranho recusado", (await ir2("POST", "/v1/ia/../../x", "{}")).status === 404);
ok("central: status diz que tem central", (await (await ir2("GET", "/status")).json()).central === true);
