// Yuh Extension — conexão com o Yuh Scanner Mobile (celular).
// A extensão tem uma "caixa" no carteiro (Cloudflare) e um par de chaves. O QR Code leva o
// endereço da caixa + a chave pública; o celular responde com a dele; os dois mostram o mesmo
// código de 4 números; o celular confirma. Depois disso, cada documento chega trancado com a
// chave daquele celular. Celular desconhecido é ignorado.
import { novoPar, segredo, codigo, abrir, aleatorio } from "./cripto.js";
import { config } from "./banco.js";

export const CARTEIRO_PADRAO = "https://yuh-carteiro.iuripsiqueira.workers.dev";   // carteiro publicado na Cloudflare do Iuri (dá para trocar na ⚙)
export const APP_CELULAR = "https://ryuuuuuki.github.io/yuh-scanner-mobile/";
const L = chrome.storage.local;

export async function carteiro(){ const c = await config(); return (c.carteiro || CARTEIRO_PADRAO).replace(/\/+$/, ""); }

// caixa + chaves deste navegador (criadas uma vez)
export async function minhaCaixa(){
  const { caixa } = await L.get("caixa");
  if (caixa) return caixa;
  const par = await novoPar();
  const nova = { canal: aleatorio(16), ...par };
  await L.set({ caixa: nova });
  return nova;
}
export async function celulares(){ const { celulares: c = [] } = await L.get("celulares"); return c; }
async function salvarCelulares(c){ await L.set({ celulares: c }); }
export async function desconectarCelular(id){ await salvarCelulares((await celulares()).filter(x => x.id !== id)); }

// texto do QR: o link do app do celular com os dados da conexão (a câmera comum também abre)
export async function textoDoQr(nomePc){
  const cx = await minhaCaixa(), url = await carteiro();
  const dados = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, u: url, c: cx.canal, k: cx.pub, n: nomePc })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return APP_CELULAR + "#par=" + dados;
}

// pareamento aberto (enquanto o QR está na tela)
let pareando = null; // { ate, pedido: {de, nome, pub, segredo, codigo} }
export function abrirPareamento(seg = 120){ pareando = { ate: Date.now() + seg * 1000, pedido: null }; }
export function fecharPareamento(){ pareando = null; }
export function pareamentoAberto(){ return !!pareando && Date.now() < pareando.ate; }

const api = async (caminho, op = {}) => {
  const url = await carteiro(); if (!url) throw new Error("sem carteiro configurado");
  const r = await fetch(url + caminho, { ...op, signal: AbortSignal.timeout(15000) });
  if (!r.ok && r.status !== 404) throw new Error("carteiro: " + r.status);
  return r.status === 404 ? null : r.json();
};

// olha a caixa; devolve eventos: {tipo:"par", nome, codigo} | {tipo:"conectado", nome} | {tipo:"doc", de, nome, docNome, imagens}
export async function olharCaixa(){
  const cx = await minhaCaixa();
  const lista = await api(`/c/${cx.canal}`);
  const eventos = [];
  for (const id of lista?.ids || []){
    const p = await api(`/c/${cx.canal}/${id}`);
    await api(`/c/${cx.canal}/${id}`, { method: "DELETE" }).catch(() => {});
    if (!p) continue;
    try {
      if (p.tipo === "par"){
        if (!pareamentoAberto() || typeof p.pub !== "string") continue;
        const seg = await segredo(cx.privJwk, p.pub);
        pareando.pedido = { de: p.de, nome: String(p.nome || "Celular").slice(0, 40), pub: p.pub, segredo: seg, codigo: await codigo(cx.pub, p.pub) };
        eventos.push({ tipo: "par", nome: pareando.pedido.nome, codigo: pareando.pedido.codigo });
      } else if (p.tipo === "ok"){
        const ped = pareando?.pedido;
        if (!ped || ped.de !== p.de) continue;
        const m = await abrir(ped.segredo, p);            // só abre se o celular tem o mesmo segredo
        if (!m.ok) continue;
        const lista = (await celulares()).filter(x => x.id !== ped.de);
        lista.unshift({ id: ped.de, nome: ped.nome, segredo: ped.segredo, quando: Date.now() });
        await salvarCelulares(lista);
        pareando = null;
        eventos.push({ tipo: "conectado", nome: ped.nome });
      } else if (p.tipo === "doc"){
        const cel = (await celulares()).find(x => x.id === p.de);
        if (!cel) continue;                                // celular desconhecido: ignora
        const m = await abrir(cel.segredo, p);
        if (!Array.isArray(m.imagens) || !m.imagens.length) continue;
        eventos.push({ tipo: "doc", de: cel.id, nome: cel.nome, docNome: String(m.nome || "Documento").slice(0, 80), imagens: m.imagens.slice(0, 6) });
      } else if (p.tipo === "tchau"){
        const cel = (await celulares()).find(x => x.id === p.de);
        if (cel){ try { await abrir(cel.segredo, p); await desconectarCelular(cel.id); eventos.push({ tipo: "desconectou", nome: cel.nome }); } catch {} }
      }
    } catch { /* pacote estragado ou de outra chave: ignora */ }
  }
  return eventos;
}
