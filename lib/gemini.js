// Yuh Extension — a IA que entende formulários desconhecidos (Gemini, plano grátis).
// Recebe SÓ a planta do formulário (rótulos, tipos, opções). Nenhum dado de cliente vai junto.
import { config } from "./banco.js";
import { DADOS } from "./ficha.js";

const MODELOS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];

export async function temIA(){ return !!(await config()).geminiChave; }

// campos: [{id, rotulo, tipo, opcoes, contexto, placeholder, nome}] → { id: chave | "-" }
export async function mapearComIA(campos){
  const { geminiChave, geminiModelo } = await config();
  if (!geminiChave) throw new Error("sem chave do Gemini");
  const lista = campos.map(c => ({ id: c.id, rotulo: c.rotulo, secao: c.contexto || undefined, tipo: c.tipo, opcoes: c.opcoes?.slice(0, 30), dica: c.placeholder || undefined, nome_tecnico: c.nome || undefined }));
  const dados = DADOS.map(([k, , d]) => `- ${k}: ${d}`).join("\n");
  const pedido = `Você ajuda a preencher formulários de sites brasileiros (cartório, governo) com dados de um documento de identidade (RG, CNH ou certidão).
Dados disponíveis (chaves):
${dados}

Abaixo estão os campos de um formulário, na ordem em que aparecem. Para cada campo, diga qual chave preenche ele.
Use "-" quando nenhum dado acima serve (ex.: e-mail, telefone, endereço, dados de outra pessoa como cônjuge, campos de outro assunto).
Se o formulário tiver mais de uma pessoa (ex.: comprador e vendedor), use as chaves só para a primeira pessoa e "-" para as outras.
Responda SÓ um objeto JSON: {"<id>": "<chave ou ->", ...} com todos os ids.

Campos:
${JSON.stringify(lista)}`;
  let ultimoErro;
  for (const modelo of [geminiModelo, ...MODELOS].filter(Boolean)){
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiChave },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: pedido }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      });
    } catch { throw new Error("Não consegui falar com o Gemini (sem internet?)."); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404){ ultimoErro = new Error(`modelo ${modelo} não encontrado`); continue; }
    if (r.status === 400 && /API key/i.test(j.error?.message || "")) throw new Error("O Gemini recusou a chave. Confira na engrenagem ⚙.");
    if (r.status === 429) throw new Error("O Gemini pediu para esperar (limite grátis por minuto). Tente de novo em 1 minuto.");
    if (!r.ok){ ultimoErro = new Error(`Gemini: erro ${r.status} ${j.error?.message || ""}`); continue; }
    const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "{}";
    let obj; try { obj = JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim()); } catch { throw new Error("A IA respondeu algo que não entendi."); }
    const validas = new Set(DADOS.map(d => d[0]).concat("-")), mapa = {};
    for (const c of campos){ const k = obj[c.id]; mapa[c.id] = validas.has(k) ? k : "-"; }
    return mapa;
  }
  throw ultimoErro || new Error("Gemini indisponível");
}
