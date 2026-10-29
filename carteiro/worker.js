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

const VIDA = 24 * 60 * 60;          // segundos
const MAX = 20 * 1024 * 1024;       // bytes por pacote
const MAX_NA_CAIXA = 50;
const CANAL = /^[A-Za-z0-9_-]{22,64}$/, ID = /^[a-z0-9]{6,40}$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function lerIndice(env, canal){
  try { return JSON.parse(await env.CAIXA.get("i:" + canal) || "[]"); } catch { return []; }
}

export default {
  async fetch(req, env){
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const [, c, canal, id] = url.pathname.split("/");
    if (url.pathname === "/" || url.pathname === "/status") return json({ app: "Yuh Carteiro", ok: true });
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
