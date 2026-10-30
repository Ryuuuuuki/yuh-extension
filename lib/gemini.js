// Yuh Extension — a IA que entende formulários desconhecidos (Gemini, plano grátis).
// Recebe SÓ a planta do formulário (rótulos, tipos, opções). Nenhum dado de cliente vai junto.
import { config } from "./banco.js";
import { central, temCentral } from "./central.js";
import { DADOS } from "./ficha.js";

const MODELOS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
const ESPERA_MS = 25000;   // modelo lotado às vezes fica pendurado: passa para o próximo

export async function temIA(){ return !!(await config()).geminiChave || await temCentral(); }

// campos: [{id, rotulo, tipo, opcoes, contexto, placeholder, nome, pos, ajuda, max}]
// disponiveis: chaves que o documento atual tem (só os NOMES das chaves, nunca os valores)
// devolve { id: receita } — receita = "chave" | "{a}/{b}" | "=texto" | "-"
// segredos: valores da ficha — qualquer texto da tela que contenha um deles NÃO vai para a IA
export async function mapearComIA(campos, disponiveis = [], segredos = []){
  const { geminiChave, geminiModelo } = await config();
  const pelaCentral = !geminiChave && await temCentral();
  if (!geminiChave && !pelaCentral) throw new Error("sem chave do Gemini");
  const norm = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const palavras = new Set(segredos.flatMap(v => norm(v).split(/[^A-Z0-9]+/)).filter(p => p.length >= 4 && !/^(SILVA|SANTOS|SOUZA|SOUSA|OLIVEIRA|PEREIRA|BRASILEIRA?)$/.test(p)));
  // limpa: tira números longos (CPF/RG de qualquer pessoa) e textos com dados do cliente
  const limpo = t => {
    if (!t) return undefined;
    const s = String(t).replace(/\d[\d.\-\/ ]{4,}\d/g, "#");
    return norm(s).split(/[^A-Z0-9]+/).some(p => palavras.has(p)) ? "(oculto)" : s;
  };
  const lista = campos.map(c => ({ id: c.id, rotulo: limpo(c.rotulo), secao: limpo(c.contexto), tipo: c.tipo, opcoes: c.opcoes?.slice(0, 40).map(limpo), dica: limpo(c.placeholder),
    ajuda: limpo(c.ajuda), nome_tecnico: limpo(c.nome), max_letras: c.max || undefined, posicao_xy_largura: c.pos }));
  const dados = DADOS.map(([k, , d]) => `- ${k}: ${d}${disponiveis.includes(k) ? "" : " (este documento NÃO tem)"}`).join("\n");
  const pedido = `Você é o cérebro de uma extensão que preenche formulários de QUALQUER sistema brasileiro (cartórios, governo, bancos, sistemas antigos e modernos) com os dados de um documento de identidade (RG/CIN, CNH ou certidão).
Você recebe só a ESTRUTURA do formulário (rótulos, seções, textos de ajuda, opções, posição na tela). Os dados do cliente ficam no computador; você decide uma RECEITA para cada campo e a extensão monta o valor.

Dados que existem (chaves):
${dados}

Formatos de receita:
- "chave"                 → coloca o dado (ex.: "cpf"). Em listas/seleções, a extensão escolhe a opção que bate com o dado.
- "{chave}texto{chave}"   → junta dados e texto (ex.: "{orgao}/{orgaoUf}" para "Órgão/UF"; "{naturalidade} - {natUf}").
- "=texto"                → texto fixo, quando o campo pede um valor que não é dado (ex.: "=CPF" num seletor CPF/CNPJ quando há CPF; "=Carteira de Identidade" num seletor de tipo de documento; use exatamente o texto de uma das opções quando for lista).
- "-"                     → não preencher.

Tenha autonomia e bom senso, como um funcionário experiente de cartório:
- Use o rótulo, a seção, a ajuda, o nome técnico, a posição (campos na mesma altura ficam lado a lado; "UF" logo depois de "Naturalidade" é a UF de nascimento) e as opções.
- Rótulos abreviados ou estranhos ("Exped.", "Genitora", "Ascendente materno", "Filiação 1") → descubra o significado.
- "Filiação 1"/"Filiação 2" sem dizer pai/mãe → use filiacao1/filiacao2.
- Campo de outra pessoa (cônjuge, procurador, testemunha, 2º outorgante), de endereço, contato, profissão, estado civil, ou documento que este não é (passaporte, OAB, título de eleitor) → "-".
- Se a data tem campo próprio, use a chave de data (a extensão ajusta o formato).
- Na dúvida real, "-" é melhor do que errar.
Responda SÓ um objeto JSON {"<id>": "<receita>"} com todos os ids.

Campos (na ordem da tela):
${JSON.stringify(lista)}`;
  let ultimoErro;
  for (const modelo of [geminiModelo, ...MODELOS].filter(Boolean)){
    let r;
    const corpo = JSON.stringify({ contents: [{ role: "user", parts: [{ text: pedido }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } });
    const ac = new AbortController(), relogio = setTimeout(() => ac.abort(), ESPERA_MS);
    try {
      if (pelaCentral) r = await central(`/v1/ia/${encodeURIComponent(modelo)}`, { corpo, tipo: "application/json", sinal: ac.signal });
      else r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiChave }, body: corpo, signal: ac.signal,
      });
    } catch (e) {
      clearTimeout(relogio);
      if (ac.signal.aborted){ ultimoErro = new Error(`O Gemini (${modelo}) demorou demais.`); continue; }
      throw pelaCentral ? e : new Error("Não consegui falar com o Gemini (sem internet?).");
    }
    clearTimeout(relogio);
    const j = await r.json().catch(() => ({}));
    if (pelaCentral && !r.ok && j.erro && !j.error) throw new Error(j.erro);
    if (r.status === 404){ ultimoErro = new Error(`modelo ${modelo} não encontrado`); continue; }
    if (r.status === 400 && /API key/i.test(j.error?.message || "")) throw new Error("O Gemini recusou a chave. Confira na engrenagem ⚙.");
    if (r.status === 429) throw new Error("O Gemini pediu para esperar (limite grátis por minuto). Tente de novo em 1 minuto.");
    if (!r.ok){ ultimoErro = new Error(`Gemini: erro ${r.status} ${j.error?.message || ""}`); continue; }
    const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "{}";
    let obj; try { obj = JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim()); } catch { throw new Error("A IA respondeu algo que não entendi."); }
    const chaves = new Set(DADOS.map(d => d[0])), mapa = {};
    const valida = r => typeof r === "string" && r.length <= 80 && (r === "-" || chaves.has(r) || (r[0] === "=" && r.length > 1) || (/\{\w+\}/.test(r) && [...r.matchAll(/\{(\w+)\}/g)].every(m => chaves.has(m[1]))));
    for (const c of campos){ const r = typeof obj[c.id] === "string" ? obj[c.id].trim() : obj[c.id]; mapa[c.id] = valida(r) ? r : "-"; }
    return mapa;
  }
  throw ultimoErro || new Error("Gemini indisponível");
}
