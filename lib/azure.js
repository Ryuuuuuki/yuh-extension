// Yuh Extension — leitura de texto com o Microsoft Azure AI Vision (plano grátis F0).
// A foto vai pela central do cartório (carteiro na Cloudflare), que só repassa ao Azure com a chave
// guardada lá e não guarda nada. Só uma cópia SEM o código do cartório usa chave própria (direto).
import { config, contarLeitura, leiturasDoMes, LIMITE_MES } from "./banco.js";
import { central, temCentral } from "./central.js";

const semAcento = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// reduz a foto (mais rápido e dentro do limite do Azure) e devolve { blob, miniatura }
export async function prepararFoto(arquivo){
  const bmp = await createImageBitmap(arquivo);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  const km = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const m = new OffscreenCanvas(Math.round(bmp.width * km), Math.round(bmp.height * km));
  m.getContext("2d").drawImage(bmp, 0, 0, m.width, m.height); bmp.close?.();
  const mb = await m.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const miniatura = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(mb); });
  return { blob, miniatura };
}

// lê uma foto: devolve { texto, conf } (conf = confiança por palavra, 0..1)
export async function lerFoto(blob){
  const { azurePonto, azureChave } = await config();
  let r;
  if (await temCentral()){
    r = await central("/v1/ler", { corpo: blob, tipo: "application/octet-stream" });
    if (!r.ok){ const j = await r.clone().json().catch(() => ({})); if (j.erro && !j.error) throw new Error(j.erro); }
  } else if (azurePonto && azureChave){
    if (await leiturasDoMes() >= LIMITE_MES) throw new Error(`Trava do mês: já foram ${LIMITE_MES} leituras neste PC. Para não sair do grátis, volta dia 1º.`);
    try {
      r = await fetch(azurePonto + "/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read", {
        method: "POST", headers: { "Ocp-Apim-Subscription-Key": azureChave, "Content-Type": "application/octet-stream" }, body: blob,
      });
    } catch { throw new Error("Não consegui falar com o Azure (sem internet?)."); }
  } else throw new Error("Falta configurar o Azure (engrenagem ⚙ no topo).");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(explicar(j.error, r.status));
  await contarLeitura();
  // remonta as linhas lado a lado numa linha só (é como o ler.js espera)
  const linhas = [];
  for (const b of j.readResult?.blocks || []) for (const l of b.lines || []){
    const ys = l.boundingPolygon.map(p => p.y), xs = l.boundingPolygon.map(p => p.x);
    linhas.push({ text: l.text, words: l.words || [], y: (Math.min(...ys) + Math.max(...ys)) / 2, h: Math.max(...ys) - Math.min(...ys), x: Math.min(...xs) });
  }
  linhas.sort((a, b) => a.y - b.y);
  const filas = [];
  for (const l of linhas){ const f = filas[filas.length - 1]; if (f && Math.abs(f.y - l.y) < Math.min(f.h, l.h) * 0.6) f.itens.push(l); else filas.push({ y: l.y, h: l.h, itens: [l] }); }
  const texto = filas.map(f => f.itens.sort((a, b) => a.x - b.x).map(l => l.text).join("  ")).join("\n");
  const conf = new Map();
  for (const l of linhas) for (const w of l.words){ const t = semAcento(w.text).replace(/[^A-Z0-9]/g, ""); if (t) conf.set(t, Math.min(conf.get(t) ?? 1, w.confidence)); }
  return { texto, conf };
}

function explicar(e, st){
  const m = (e && e.message) || "";
  if (st === 401) return "O Azure recusou a chave. Confira a CHAVE 1 e o ponto de extremidade na engrenagem ⚙.";
  if (st === 404) return "Ponto de extremidade errado. Confira na engrenagem ⚙.";
  if (st === 429) return "Muitas leituras seguidas (o grátis aceita 20 por minuto) ou acabou a cota do mês. Espere um pouco.";
  if (st === 403) return "O Azure bloqueou (cota do mês acabou ou assinatura desativada). " + m;
  return `O Azure respondeu com erro (${st}). ${m}`;
}
