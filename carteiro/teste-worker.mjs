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
