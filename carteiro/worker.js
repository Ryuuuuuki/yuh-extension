// Yuh Carteiro — Cloudflare Worker (plano grátis) que leva documentos do celular para a Yuh Extension.
// Só guarda PACOTES TRANCADOS (criptografados no celular com uma chave que só a extensão tem).
// Cada PC tem uma "caixa" (canal = 128 bits aleatórios, que só quem leu o QR Code conhece).
// Os pacotes somem sozinhos em 24 h (e assim que a extensão pega).
//
// Rotas (todas com CORS liberado — o conteúdo é ilegível sem a chave):
//   POST   /c/<canal>            guarda um pacote (JSON, até 20 MB) → { id }
//   GET    /c/<canal>            lista os ids na caixa
//   GET    /c/<canal>/<id>       pega um pacote (?so=existe → { existe })
//   DELETE /c/<canal>/<id>       apaga (a extensão faz isso depois de abrir)
// Precisa de um KV ligado com o nome CAIXA.
//
// CENTRAL DO CARTÓRIO (para os colegas não precisarem de chave nenhuma):
//   POST   /v1/ler               foto (JPEG) → resposta do Azure "read" (usa a chave guardada aqui)
//   POST   /v1/ia/<modelo>       pedido do Gemini → resposta do Gemini (usa a chave guardada aqui)
//   GET    /v1/uso               leituras do mês do cartório inteiro
// Só atende quem manda o cabeçalho X-Yuh-Codigo = CODIGO (vai embutido na extensão).
// Segredos (Settings → Variables and Secrets): CODIGO, AZURE_CHAVE, GEMINI_CHAVE.
// Variáveis: AZURE_PONTO (https://….cognitiveservices.azure.com), LIMITE_MES (padrão 4500; o grátis do Azure é 5000/mês somando todos).
// As fotos só passam por aqui a caminho do Azure: nada é guardado.

const VIDA = 24 * 60 * 60;          // segundos
const MAX = 20 * 1024 * 1024;       // bytes por pacote
const MAX_NA_CAIXA = 50;
const CANAL = /^[A-Za-z0-9_-]{22,64}$/, ID = /^[a-z0-9]{6,40}$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Yuh-Codigo",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function lerIndice(env, canal){
  try { return JSON.parse(await env.CAIXA.get("i:" + canal) || "[]"); } catch { return []; }
}

// ---------------- central do cartório ----------------
const MAX_FOTO = 6 * 1024 * 1024, MAX_IA = 300 * 1024, IA_POR_DIA = 400;
const mesDe = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);      // horário de Brasília
const diaDe = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
async function contador(env, k){ return +(await env.CAIXA.get(k)) || 0; }

async function centralDoCartorio(req, env, partes){
  if (!env.CODIGO || req.headers.get("X-Yuh-Codigo") !== env.CODIGO) return json({ erro: "Código do cartório inválido. Atualize a Yuh Extension." }, 401);
  const limite = +env.LIMITE_MES || 4500, kMes = "uso:" + mesDe();
  if (req.method === "GET" && partes[1] === "uso") return json({ mes: mesDe(), leituras: await contador(env, kMes), limite });

  if (req.method === "POST" && partes[1] === "ler" && partes.length === 2){
    if (!env.AZURE_PONTO || !env.AZURE_CHAVE) return json({ erro: "A central ainda não tem a chave do Azure." }, 503);
    const foto = await req.arrayBuffer();
    if (!foto.byteLength || foto.byteLength > MAX_FOTO) return json({ erro: "Foto vazia ou grande demais." }, 413);
    const n = await contador(env, kMes);
    if (n >= limite) return json({ erro: `Trava do mês do cartório: já foram ${n} leituras. Para não sair do grátis, volta dia 1º.` }, 429);
    const r = await fetch(env.AZURE_PONTO.replace(/\/+$/, "") + "/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read", {
      method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_CHAVE, "Content-Type": "application/octet-stream" }, body: foto,
    });
    const corpo = await r.text();
    if (r.ok) await env.CAIXA.put(kMes, String(n + 1), { expirationTtl: 40 * 86400 });
    return new Response(corpo, { status: r.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  if (req.method === "POST" && partes[1] === "ia" && partes.length === 3 && /^gemini-[\w.-]{1,40}$/.test(partes[2])){
    if (!env.GEMINI_CHAVE) return json({ erro: "A central ainda não tem a chave do Gemini." }, 503);
    const pedido = await req.text();
    if (pedido.length > MAX_IA) return json({ erro: "Pedido grande demais." }, 413);
    const kDia = "ia:" + diaDe(), n = await contador(env, kDia);
    if (n >= IA_POR_DIA) return json({ erro: "Limite de IA do dia do cartório." }, 429);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${partes[2]}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_CHAVE }, body: pedido,
    });
    const corpo = await r.text();
    if (r.ok) await env.CAIXA.put(kDia, String(n + 1), { expirationTtl: 3 * 86400 });
    return new Response(corpo, { status: r.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  return json({ erro: "endereço inválido" }, 404);
}

export default {
  async fetch(req, env){
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const [, c, canal, id] = url.pathname.split("/");
    if (url.pathname === "/" || url.pathname === "/status") return json({ app: "Yuh Carteiro", ok: true, central: !!env.CODIGO });
    if (c === "v1") return centralDoCartorio(req, env, url.pathname.split("/").slice(1));
    if (c !== "c" || !CANAL.test(canal || "") || (id && !ID.test(id))) return json({ erro: "endereço inválido" }, 404);

    if (req.method === "POST" && !id){
      const tam = +req.headers.get("Content-Length") || 0;
      if (tam > MAX) return json({ erro: "pacote grande demais" }, 413);
      const corpo = await req.text();
      if (corpo.length > MAX) return json({ erro: "pacote grande demais" }, 413);
      let p; try { p = JSON.parse(corpo); } catch { return json({ erro: "pacote inválido" }, 400); }
      if (!p || typeof p.tipo !== "string" || typeof p.de !== "string") return json({ erro: "pacote inválido" }, 400);
      const ind = await lerIndice(env, canal);
      if (ind.length >= MAX_NA_CAIXA) return json({ erro: "caixa cheia" }, 429);
      const novo = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      await env.CAIXA.put("m:" + canal + ":" + novo, corpo, { expirationTtl: VIDA });
      ind.push(novo);
      await env.CAIXA.put("i:" + canal, JSON.stringify(ind), { expirationTtl: VIDA });
      return json({ id: novo });
    }
    if (req.method === "GET" && !id) return json({ ids: await lerIndice(env, canal) });
    if (req.method === "GET" && id){
      const v = await env.CAIXA.get("m:" + canal + ":" + id);
      if (url.searchParams.get("so") === "existe") return json({ existe: v !== null });
      if (v === null) return json({ erro: "não existe (já foi entregue ou passou de 24 h)" }, 404);
      return new Response(v, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (req.method === "DELETE" && id){
      await env.CAIXA.delete("m:" + canal + ":" + id);
      const ind = (await lerIndice(env, canal)).filter(x => x !== id);
      if (ind.length) await env.CAIXA.put("i:" + canal, JSON.stringify(ind), { expirationTtl: VIDA });
      else await env.CAIXA.delete("i:" + canal);
      return json({ ok: true });
    }
    return json({ erro: "método não aceito" }, 405);
  },
};
