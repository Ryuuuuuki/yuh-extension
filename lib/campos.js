// Yuh Extension — descobrir o que cada campo do site pede.
// 1º o que já foi aprendido para o site; 2º este dicionário (grátis, na hora);
// 3º a IA (só com os rótulos, nunca com dados). "-" = campo que a ficha não preenche (e-mail, telefone…).

const sem = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9º°ª ]+/g, " ").replace(/\s+/g, " ").trim();
const humano = s => (s || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-\[\].]+/g, " ");

// assinatura estável do campo (para lembrar dele na próxima visita)
export const assinatura = c => [sem(c.rotulo), sem(humano(c.nome)), c.tipo, sem(c.contexto).slice(0, 30)].join("|");

// o endereço do site sem números/códigos (formulário "/pedido/123/editar" = "/pedido/*/editar")
export function chaveDoSite(url){
  try { const u = new URL(url); return u.origin + u.pathname.replace(/\/\d[\w-]*/g, "/*").replace(/\/[0-9a-f]{16,}/gi, "/*").replace(/\/$/, ""); }
  catch { return url; }
}

const IGNORAR = /\b(PASSAPORTE|OAB|CARTEIRA DE TRABALHO|CTPS|TITULO DE ELEITOR|RESERVISTA|PIS|NIS|INSCRICAO ESTADUAL|INSCRICAO MUNICIPAL|E ?MAIL|TELEFONE|CELULAR|FONE|WHATSAPP|CEP|ENDERECO|LOGRADOURO|BAIRRO|COMPLEMENTO|PROFISSAO|OCUPACAO|ESTADO CIVIL|SENHA|CAPTCHA|CODIGO DE VERIFICACAO|OBSERVA\w*|PROTOCOLO|ASSUNTO|MENSAGEM|RENDA|SALARIO|EMPRESA|CNPJ|RAZAO SOCIAL|NOME FANTASIA|NOME SOCIAL|APELIDO|CONJUGE|ESPOSA|MARIDO)\b/;
const DATA_TIPO = c => c.tipo === "date" || /DD ?\/ ?MM|DATA/.test(sem(c.placeholder));

const REGRAS = [
  ["natUf", R => /\b(UF|ESTADO)\b.*\b(NASC|NATURAL)|\b(NASC|NATURAL)\w*\b.*\b(UF|ESTADO)\b/.test(R)],
  ["naturalidade", R => /NATURALIDADE|\b(MUNICIPIO|CIDADE|LOCAL)\b.*\bNASC|CIDADE NATAL|NATURAL DE/.test(R)],
  ["filiacao1", R => /^FILIACAO ?(1|I|UM)$|^1 ?ª? ?FILIACAO$/.test(R)],
  ["filiacao2", R => /^FILIACAO ?(2|II|DOIS)$|^2 ?ª? ?FILIACAO$/.test(R)],
  ["mae", R => /\b(MAE|GENITORA)\b/.test(R)],
  ["pai", R => /\b(PAI|GENITOR)\b/.test(R)],
  ["cpf", R => /\bCPF\b/.test(R)],
  ["primeiraHab", R => /(PRIMEIRA|1 ?[AªO]?) ?HABILITACAO/.test(R)],
  ["nascimento", R => /\bNASC|NASCIMENTO|\bDN\b/.test(R)],
  ["orgaoComUf", R => /^(ORGAO|ORG)\b.*\b(UF|ESTADO)$|EMISSOR ?(\/|E)? ?UF$|EXP(EDIDOR)? ?\/? ?UF$/.test(R)],
  ["orgaoUf", R => /\b(UF|ESTADO)\b.*\b(ORGAO|EMISSOR|EXPED|EMIS|RG|IDENTIDADE|DOC)|\b(ORGAO|EMISSOR|EXPED)\w*\b.*\b(UF|ESTADO)\b/.test(R)],
  ["orgao", R => /\bORGAO\b|\bEMISSOR\b|\bEXPEDIDOR\b|ORG ?EXP|ORG ?EMI/.test(R)],
  ["expedicao", R => /EXPEDICAO|EMISSAO|EXPEDID[OA] EM|EMITID[OA] EM|DATA ?EXP|DT ?EXP/.test(R)],
  ["validade", R => /VALIDADE|VENCIMENTO|VALIDO ATE/.test(R)],
  ["categoria", R => /CATEGORIA/.test(R)],
  ["cnh", R => /\bCNH\b|HABILITACAO/.test(R) && !/TIPO/.test(R)],
  ["matricula", R => /MATRICULA/.test(R)],
  ["sexo", R => /\bSEXO\b|\bGENERO\b/.test(R)],
  ["nacionalidade", R => /NACIONALIDADE/.test(R)],
  ["tipoDoc", (R, c) => /TIPO\b.*\bDOC|DOCUMENTO DE IDENTIFICACAO$|TIPO DE IDENTIFICACAO/.test(R) && (c.tipo === "select" || c.tipo === "radio")],
  ["rg", R => /\bRG\b|IDENTIDADE|REGISTRO GERAL|^N[ºO°]? ?(DO )?DOC|NUMERO (DO )?DOC|DOCUMENTO DE IDENTIFICACAO/.test(R)],
  ["nome", R => /^(NOME( CIVIL)?( COMPLETO)?( DO (A )?(REQUERENTE|SOLICITANTE|OUTORGANTE|DECLARANTE|TITULAR|INTERESSADO|CIDADAO|USUARIO|PARTE|BENEFICIARIO))?|REQUERENTE|SOLICITANTE|INTERESSADO|TITULAR|NOME E SOBRENOME)$/.test(R)],
];

// c: campo; anterior: chave do campo anterior (para "UF" e "Número" soltos)
export function classificar(c, anterior){
  if ((c.tipo === "select" || c.tipo === "radio") && (c.opcoes || []).some(o => sem(o) === "CPF") && (c.opcoes || []).some(o => sem(o) === "CNPJ")) return "tipoPessoa";
  for (const base of [sem(c.rotulo), sem(humano(c.nome))]){
    if (!base) continue;
    if (/\bCPF\b/.test(base) && !/CONJUGE|ESPOSA|MARIDO|RESPONSAVEL|PROCURADOR/.test(base)) return "cpf";
    if (IGNORAR.test(base)) return "-";
    // rótulos soltos que dependem do vizinho / da seção
    if (/^(UF|ESTADO|UF ?\/ ?ESTADO)$/.test(base)){
      if (anterior === "naturalidade" || /NASC|NATURAL/.test(sem(c.contexto))) return "natUf";
      if (["orgao", "rg", "expedicao"].includes(anterior) || /DOCUMENTO|IDENTIFICA|IDENTIDADE/.test(sem(c.contexto))) return "orgaoUf";
      return null;
    }
    if (/^(N[ºO°]?|NUMERO|NUM)$/.test(base)){
      if (anterior === "tipoDoc" || /DOCUMENTO|IDENTIFICA|IDENTIDADE/.test(sem(c.contexto))) return "rg";
      return null;
    }
    if (/^TIPO$/.test(base) && (c.opcoes || []).some(o => /\b(RG|CNH|IDENTIDADE|PASSAPORTE)\b/.test(sem(o)))) return "tipoDoc";
    if ((c.tipo === "select" || c.tipo === "radio") && (c.opcoes || []).some(o => sem(o) === "CPF") && (c.opcoes || []).some(o => sem(o) === "CNPJ")) return "tipoPessoa";
    if (/^(DATA|DT)$/.test(base)) return null;
    for (const [k, t] of REGRAS) if (t(base, c)){
      if (["nascimento", "expedicao", "validade", "primeiraHab"].includes(k) && c.tipo === "select") continue;
      return k;
    }
  }
  return null;
}

// mapa completo: { id: chave | "-" | null }, e de onde veio cada um
export function mapearPorDicionario(campos, aprendido = {}){
  const mapa = {}, origem = {};
  let anterior = null;
  for (const c of campos){
    const a = assinatura(c);
    if (a in aprendido){ mapa[c.id] = aprendido[a]; origem[c.id] = "memoria"; }
    else { const k = classificar(c, anterior); mapa[c.id] = k; origem[c.id] = k ? "dicionario" : null; }
    if (mapa[c.id] && mapa[c.id] !== "-") anterior = mapa[c.id];
  }
  return { mapa, origem };
}
