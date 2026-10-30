// Yuh Extension — central do cartório: a leitura (Azure) e a IA (Gemini) passam pelo carteiro na
// Cloudflare, que guarda as chaves. Assim os colegas só instalam a extensão: nada de chave.
// Se o PC tiver chave própria na ⚙, ela continua sendo usada (direto, como antes).
// O código do cartório fica em lib/codigo-cartorio.js, que não vai para o GitHub.
import { carteiro } from "./celular.js";

let codigo;
export async function codigoDoCartorio(){
  if (codigo === undefined) codigo = await import("./codigo-cartorio.js").then(m => m.CODIGO || "").catch(() => "");
  return codigo;
}
export async function temCentral(){ return !!(await codigoDoCartorio()); }

// chama a central → Response (lança erro só se não houver internet)
export async function central(caminho, { metodo = "POST", corpo, tipo } = {}){
  const cod = await codigoDoCartorio();
  if (!cod) throw new Error("Esta cópia da extensão não tem o código do cartório. Configure as chaves na ⚙.");
  try {
    return await fetch((await carteiro()) + caminho, { method: metodo, headers: { "X-Yuh-Codigo": cod, ...(tipo ? { "Content-Type": tipo } : {}) }, body: corpo });
  } catch { throw new Error("Não consegui falar com a central do cartório (sem internet?)."); }
}
