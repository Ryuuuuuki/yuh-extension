// Yuh Extension — conversa com o Yuh Scanner do Windows aberto neste PC (a "ponte").
// O app só responde para extensões do Chrome e só entrega o que foi salvo nele nas últimas 24 h.
export const PONTE = "http://127.0.0.1:47321";
const H = { "X-Yuh-Extensao": "1" }; // o app só responde a pedidos com esse sinal (sites não conseguem mandar)

export async function yuhAberto(){
  try { const r = await fetch(PONTE + "/v1/status", { headers: H, signal: AbortSignal.timeout(1500) }); return r.ok; }
  catch { return false; }
}
// recursos do app aberto (o 0.8.0 antigo de teste não tinha "grade")
export async function recursosDoYuh(){
  try { const r = await fetch(PONTE + "/v1/status", { headers: H, signal: AbortSignal.timeout(1500) }); return r.ok ? ((await r.json()).recursos || ["salvos"]) : null; }
  catch { return null; }
}
export async function listarDoPc(){
  const r = await fetch(PONTE + "/v1/docs", { headers: H, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error("O Yuh Scanner respondeu com erro.");
  return (await r.json()).docs || [];
}
// devolve os arquivos do documento como File (PDF ou JPG), prontos para a leitura
export async function baixarDoPc(doc){
  const arqs = [];
  for (let i = 0; i < doc.arquivos; i++){
    const r = await fetch(`${PONTE}/v1/docs/${encodeURIComponent(doc.id)}/${i}`, { headers: H });
    if (r.status === 410) throw new Error("Esse arquivo foi movido ou apagado da pasta.");
    if (!r.ok) throw new Error("Não consegui pegar o arquivo no Yuh Scanner.");
    const b = await r.blob();
    arqs.push(new File([b], `${doc.nome}${doc.arquivos > 1 ? "_" + (i + 1) : ""}.${b.type === "application/pdf" ? "pdf" : "jpg"}`, { type: b.type }));
  }
  return arqs;
}

// o que está no grid do Yuh Scanner agora (sem salvar). Devolve { id, nome, paginas } ou null.
export async function gradeAtual(){
  try {
    const r = await fetch(PONTE + "/v1/atual", { headers: H, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
export async function baixarGrade(g, limite = g.paginas){
  const arqs = [];
  for (let i = 0; i < Math.min(g.paginas, limite); i++){
    const r = await fetch(`${PONTE}/v1/atual/${encodeURIComponent(g.id)}/${i}`, { headers: H });
    if (!r.ok) throw new Error("As páginas do Yuh Scanner expiraram. Abra a lista de novo.");
    arqs.push(new File([await r.blob()], `${g.nome || "Yuh Scanner"}_${i + 1}.jpg`, { type: "image/jpeg" }));
  }
  return arqs;
}
