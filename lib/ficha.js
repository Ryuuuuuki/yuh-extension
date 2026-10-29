// Yuh Extension — a ficha: os dados do documento, já no formato que os formulários pedem.
// Parte do que vem do ler.js é desmembrado (SSP/BA → órgão SSP + UF BA; GUARULHOS, SP → cidade + UF).
import { lerDocumento } from "./ler.js";

// catálogo de dados (a ordem é a da ficha no painel; "desc" vai para a IA entender o que é cada um)
export const DADOS = [
  ["nome", "Nome", "nome completo da pessoa"],
  ["cpf", "CPF", "número do CPF"],
  ["nascimento", "Data de nascimento", "data de nascimento"],
  ["sexo", "Sexo", "sexo (Masculino/Feminino)"],
  ["mae", "Mãe", "nome da mãe (filiação, genitora)"],
  ["pai", "Pai", "nome do pai (filiação, genitor)"],
  ["naturalidade", "Naturalidade (cidade)", "cidade onde nasceu"],
  ["natUf", "UF de nascimento", "estado (sigla) onde nasceu"],
  ["nacionalidade", "Nacionalidade", "nacionalidade"],
  ["tipoDoc", "Tipo de documento", "tipo do documento de identidade (RG, CNH…)"],
  ["rg", "Nº do documento (RG)", "número do documento de identidade / RG"],
  ["orgao", "Órgão emissor", "órgão expedidor do documento (sigla, ex.: SSP)"],
  ["orgaoUf", "UF do órgão", "estado (sigla) do órgão expedidor"],
  ["orgaoComUf", "Órgão/UF", "órgão expedidor junto com a UF num campo só (ex.: SSP/BA)"],
  ["expedicao", "Data de expedição", "data de expedição/emissão do documento"],
  ["validade", "Validade", "data de validade do documento"],
  ["cnh", "Nº de registro da CNH", "número de registro da CNH"],
  ["categoria", "Categoria da CNH", "categoria da habilitação"],
  ["primeiraHab", "1ª habilitação", "data da primeira habilitação"],
  ["matricula", "Matrícula da certidão", "matrícula da certidão (32 dígitos)"],
];
export const NOME_DADO = Object.fromEntries(DADOS.map(([k, r]) => [k, r]));

// texto lido + confiança → ficha { tipo, dados: { chave: { valor, situacao, porque } } }
export function montarFicha(texto, conf){
  const { tipo, ficha } = lerDocumento(texto, conf);
  const d = {};
  const poe = (k, valor, situacao = "ok", porque = "") => { if (valor) d[k] = { valor, situacao, porque }; };
  const de = k => ficha.find(f => f.campo === k);
  for (const f of ficha) if (f.valor) poe(f.campo, f.valor, f.situacao, f.porque);

  // RG / CIN: número do documento
  if (de("registroGeral")?.valor){ const r = de("registroGeral"); poe("rg", r.valor, r.situacao, r.porque); }
  else if (tipo === "RG" && d.cpf && /REGISTRO GERAL\s*-?\s*CPF/i.test(texto.normalize("NFD").replace(/[̀-ͯ]/g, ""))) poe("rg", d.cpf.valor.replace(/\D/g, ""), "ok", "na identidade nova, o número é o CPF");
  delete d.registroGeral;
  if (de("registroCnh")?.valor){ d.cnh = d.registroCnh; } delete d.registroCnh;

  // órgão "SSP/BA" → SSP + BA
  if (d.orgao){ const m = /^([A-Za-z]+)\s*[\/-]\s*([A-Za-z]{2})$/.exec(d.orgao.valor.trim()); if (m){ d.orgaoUf = { ...d.orgao, valor: m[2].toUpperCase() }; d.orgao = { ...d.orgao, valor: m[1].toUpperCase() }; } }
  if (d.orgao && d.orgaoUf) d.orgaoComUf = { valor: `${d.orgao.valor}/${d.orgaoUf.valor}`, situacao: d.orgao.situacao, porque: d.orgao.porque };
  // CNH: "MG12345678 SSP MG"
  if (d.docIdentidade && !d.rg){ const m = /^([A-Z]{0,2}\d[\d.\-]*)\s+([A-Z]{2,6})\s+([A-Z]{2})$/.exec(d.docIdentidade.valor.trim()); if (m){ poe("rg", m[1], d.docIdentidade.situacao); poe("orgao", m[2], d.docIdentidade.situacao); poe("orgaoUf", m[3], d.docIdentidade.situacao); } }
  delete d.docIdentidade;
  // naturalidade "GUARULHOS, SP" / "CAMPINAS-SP" → cidade + UF
  if (d.naturalidade){ const m = /^(.*?)[\s,\/-]+([A-Za-z]{2})$/.exec(d.naturalidade.valor.trim()); if (m && m[1].length > 2){ d.natUf = { ...d.naturalidade, valor: m[2].toUpperCase() }; d.naturalidade = { ...d.naturalidade, valor: m[1].trim() }; } }
  // nacionalidade: documento brasileiro → Brasileira (para conferir)
  if (/\bBRA\b|BRASILEIR/i.test(texto) || ["RG", "CNH", "Certidão"].includes(tipo)) poe("nacionalidade", "Brasileira", "duvida", "deduzido: documento brasileiro");
  if (tipo !== "Desconhecido") poe("tipoDoc", tipo === "Certidão" ? "Certidão" : tipo);
  return { tipo, dados: d };
}

// título curto para a lista ("RG · Enilton Souza Neves")
export function tituloDoc(f){
  const nome = f.dados.nome?.valor ? f.dados.nome.valor.toLowerCase().replace(/(^|\s)\p{L}/gu, x => x.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, x => x.toLowerCase()) : "Sem nome";
  return `${f.tipo === "Desconhecido" ? "Documento" : f.tipo} · ${nome}`;
}
