// Yuh Extension — central do cartório: a leitura (Azure) e a IA (Gemini) passam pelo carteiro na
// Cloudflare, que guarda as chaves. Os colegas não mexem em chave nenhuma: só digitam UMA vez a
// "senha do cartório" (que o Iuri passa), para estranhos não usarem as leituras.
// A senha fica guardada neste Chrome. (Um zip do Iuri pode trazer lib/codigo-cartorio.js com ela.)
import { carteiro } from "./celular.js";

const L = chrome.storage.local;
let doArquivo;
async function senhaDoArquivo(){
  if (doArquivo === undefined) doArquivo = await import("./codigo-cartorio.js").then(m => m.CODIGO || "").catch(() => "");
  return doArquivo;
}
export async function codigoDoCartorio(){
  const { senhaCartorio } = await L.get("senhaCartorio");
  return senhaCartorio || await senhaDoArquivo();
}
export async function temCentral(){ return !!(await codigoDoCartorio()); }

// confere a senha na central e guarda → true | lança erro com a explicação
export async function guardarSenha(senha){
  senha = String(senha || "").trim();
  if (senha.length < 8) throw new Error("Senha curta demais. Cole a senha inteira.");
  let r;
  try { r = await fetch((await carteiro()) + "/v1/uso", { headers: { "X-Yuh-Codigo": senha } }); }
  catch { throw new Error("Sem internet para conferir a senha."); }
  if (r.status === 401) throw new Error("Senha errada. Confira com o Iuri.");
  if (!r.ok) throw new Error(`A central respondeu com erro (${r.status}). Tente de novo.`);
  await L.set({ senhaCartorio: senha });
  return true;
}

// chama a central → Response (lança erro só se não houver internet)
export async function central(caminho, { metodo = "POST", corpo, tipo, sinal } = {}){
  const cod = await codigoDoCartorio();
  if (!cod) throw new Error("Falta a senha do cartório (aparece na tela inicial da Yuh).");
  let r;
  try {
    r = await fetch((await carteiro()) + caminho, { method: metodo, headers: { "X-Yuh-Codigo": cod, ...(tipo ? { "Content-Type": tipo } : {}) }, body: corpo, signal: sinal });
  } catch (e) { if (sinal?.aborted) throw e; throw new Error("Não consegui falar com a central do cartório (sem internet?)."); }
  // senha trocada pelo Iuri: esquece a guardada para a caixinha aparecer de novo
  if (r.status === 401){ const { senhaCartorio } = await L.get("senhaCartorio"); if (senhaCartorio === cod) await L.remove("senhaCartorio"); }
  return r;
}
