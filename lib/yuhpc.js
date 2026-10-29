// Yuh Extension — conversa com o Yuh Scanner do Windows aberto neste PC (a "ponte").
// O app só responde para extensões do Chrome e só entrega o que foi salvo nele nas últimas 24 h.
export const PONTE = "http://127.0.0.1:47321";
const H = { "X-Yuh-Extensao": "1" }; // o app só responde a pedidos com esse sinal (sites não conseguem mandar)

export async function yuhAberto(){
  try { const r = await fetch(PONTE + "/v1/status", { headers: H, signal: AbortSignal.timeout(1500) }); return r.ok; }
  catch { return false; }
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
