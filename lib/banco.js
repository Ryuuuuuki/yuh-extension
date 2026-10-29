// Yuh Extension — onde as coisas ficam guardadas (chrome.storage.local, só neste PC).
// • config: chaves do Azure e do Gemini
// • docs: documentos lidos (somem sozinhos depois de 24 h — dado de cliente não fica parado)
// • mapas: o que a extensão aprendeu de cada site (só nomes de campos, nunca dados)
// • conta: leituras do mês (trava antes do limite grátis)

export const LIMITE_MES = 4500;
export const VIDA_DOC_MS = 24 * 60 * 60 * 1000;
const L = chrome.storage.local;

export async function config(){ const { config: c } = await L.get("config"); return c || {}; }
export async function salvarConfig(novo){ const c = await config(); await L.set({ config: { ...c, ...novo } }); }

const mes = () => new Date().toISOString().slice(0, 7);
export async function leiturasDoMes(){ const { conta } = await L.get("conta"); return conta && conta.mes === mes() ? conta.n : 0; }
export async function contarLeitura(){ const n = await leiturasDoMes(); await L.set({ conta: { mes: mes(), n: n + 1 } }); }

export async function docs(){
  const { docs: d = [] } = await L.get("docs");
  const vivos = d.filter(x => Date.now() - x.criado < VIDA_DOC_MS);
  if (vivos.length !== d.length) await L.set({ docs: vivos });
  return vivos;
}
export async function salvarDoc(doc){ const d = (await docs()).filter(x => x.id !== doc.id); d.unshift(doc); await L.set({ docs: d }); }
export async function apagarDoc(id){ await L.set({ docs: (await docs()).filter(x => x.id !== id) }); }
export async function apagarTodosDocs(){ await L.set({ docs: [] }); }

// versão 2: só guarda o que veio da IA ou de correção da pessoa (o dicionário é refeito a cada vez,
// assim melhorias no dicionário valem também para sites já visitados)
const VERSAO_MAPAS = 2;
async function conferirVersao(){ const { mapasVersao } = await L.get("mapasVersao"); if (mapasVersao !== VERSAO_MAPAS) await L.set({ mapas: {}, mapasVersao: VERSAO_MAPAS }); }
export async function mapaDoSite(site){ await conferirVersao(); const { mapas = {} } = await L.get("mapas"); return mapas[site] || {}; }
export async function salvarMapa(site, mapa){ const { mapas = {} } = await L.get("mapas"); mapas[site] = { ...(mapas[site] || {}), ...mapa }; await L.set({ mapas }); }
export async function sitesConhecidos(){ const { mapas = {} } = await L.get("mapas"); return Object.keys(mapas); }
export async function esquecerMapas(){ await L.set({ mapas: {} }); }
