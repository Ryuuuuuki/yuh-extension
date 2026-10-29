// Yuh Extension — painel lateral.
import * as banco from "./lib/banco.js";
import { prepararFoto, lerFoto } from "./lib/azure.js";
import { montarFicha, tituloDoc, completar, valorDaReceita, descreverReceita, DADOS, NOME_DADO } from "./lib/ficha.js";
import { assinatura, chaveDoSite, mapearPorDicionario } from "./lib/campos.js";
import { mapearComIA, temIA } from "./lib/gemini.js";

const $ = id => document.getElementById(id);
const C = () => $("corpo");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KURU = chrome.runtime.getURL("img/kuru.gif");
const ICO = {
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  lapis: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
};
let tela = "lista", docAberto = null, ultimoPreenchimento = null;

function aviso(t){ const a = document.createElement("div"); a.className = "aviso"; a.textContent = t; document.body.append(a); setTimeout(() => a.remove(), 3500); }
// (nos testes automáticos o painel abre numa aba própria e recebe ?aba=<id> do site)
const ABA_TESTE = +new URLSearchParams(location.search).get("aba") || 0;
async function abaAtual(){
  if (ABA_TESTE) return chrome.tabs.get(ABA_TESTE);
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t;
}
const OCULTOS = new Set(["orgaoComUf", "filiacao1", "filiacao2", "tipoPessoa"]); // calculados a partir de outros campos
const podeMexer = url => /^(https?|file):/.test(url || "") && !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/.test(url);

// ================= lista =================
async function desenharLista(novoId){
  tela = "lista"; docAberto = null;
  const c = C(); c.innerHTML = "";
  c.insertAdjacentHTML("beforeend", `<div class="importar">
    <button class="imp" id="impYuh" disabled title="Próxima etapa"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="8" rx="1.5"/><path d="M6 11V5h9l3 3v3"/><path d="M7 15h10"/></svg>Importar do Yuh Scanner<small>em breve</small></button>
    <button class="imp" id="impArq"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg>Importar documentos<small>Fotos (frente e verso juntas)</small></button>
  </div>`);
  const lista = await banco.docs();
  c.insertAdjacentHTML("beforeend", `<div class="p-sec"><span>Documentos lidos</span><span>somem sozinhos em 24 h</span></div>`);
  if (!lista.length) c.insertAdjacentHTML("beforeend", `<div class="vazio-p">Nenhum ainda. Clique em <b>Importar documentos</b> e escolha a foto (ou frente e verso) de um RG, CNH ou certidão.</div>`);
  for (const d of lista){
    const b = document.createElement("button"); b.className = "doc" + (d.id === novoId ? " novo" : "");
    b.innerHTML = `<img alt=""><span class="inf"><b></b><small></small></span><span class="origem">🖥 PC</span>`;
    b.querySelector("img").src = d.imagens[0]; b.querySelector("b").textContent = d.titulo;
    const n = Object.values(d.dados).filter(x => x.situacao === "duvida").length;
    b.querySelector("small").textContent = `${d.tipo === "Desconhecido" ? "Documento" : d.tipo} · ${n ? n + " para conferir" : "tudo lido"}`;
    b.onclick = () => abrirFicha(d.id);
    c.append(b);
  }
  const cfg = await banco.config();
  if (!cfg.azurePonto) c.insertAdjacentHTML("beforeend", `<div class="mapa">${ICO.info}<span><b>Falta configurar a leitura.</b> Toque na engrenagem ⚙ no topo e cole o endereço e a chave do Azure.</span></div>`);
  await notaDoSite(c);
  $("impArq").onclick = () => $("arq").click();
}
async function notaDoSite(c){
  const t = await abaAtual(); if (!t || !podeMexer(t.url)) return;
  const site = chaveDoSite(t.url), conhecido = Object.keys(await banco.mapaDoSite(site)).length > 0;
  c.insertAdjacentHTML("beforeend", `<div class="mapa">${ICO.info}<span>${conhecido ? `<b>Este site já é conhecido.</b> A Yuh lembra o que vai em cada campo.` : `<b>Site novo para a Yuh.</b> Na primeira vez ela lê <b>só os nomes dos campos</b> do formulário (nunca os dados) e guarda o que aprendeu.`}</span></div>`);
}

// ================= importar e ler =================
$("arq").onchange = async () => {
  const fs = [...$("arq").files]; $("arq").value = ""; if (!fs.length) return;
  const c = C(); c.innerHTML = "";
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Documentos</button><div class="ficha-img" id="fImg"></div><div class="lendo" id="fLendo"><img class="kuru" src="${KURU}" alt=""><span id="fMsg">Preparando ${fs.length > 1 ? "as fotos" : "a foto"}…</span></div>`);
  $("vv").onclick = () => desenharLista();
  try {
    const fotos = [];
    for (const f of fs){ const p = await prepararFoto(f); fotos.push(p); const im = document.createElement("img"); im.src = p.miniatura; $("fImg").append(im); }
    const textos = [], conf = new Map();
    for (let i = 0; i < fotos.length; i++){
      $("fMsg").textContent = fotos.length > 1 ? `Lendo a foto ${i + 1} de ${fotos.length}…` : "Lendo o documento…";
      const r = await lerFoto(fotos[i].blob); textos.push(r.texto);
      for (const [k, v] of r.conf) conf.set(k, Math.min(conf.get(k) ?? 1, v));
    }
    const ficha = montarFicha(textos.join("\n"), conf);
    const doc = { id: crypto.randomUUID(), criado: Date.now(), tipo: ficha.tipo, dados: ficha.dados, imagens: fotos.map(f => f.miniatura) };
    doc.titulo = tituloDoc(doc);
    await banco.salvarDoc(doc);
    abrirFicha(doc.id);
  } catch (e) {
    $("fLendo").outerHTML = `<div class="erro">${esc(e.message || e)}</div>`;
  }
};

// ================= ficha =================
async function abrirFicha(id){
  const d = (await banco.docs()).find(x => x.id === id);
  if (!d) return desenharLista();
  completar(d);
  tela = "ficha"; docAberto = d; ultimoPreenchimento = null;
  const c = C(); c.innerHTML = "";
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Documentos</button>
    <div class="ficha-img" id="fImg"></div>
    <div class="fonte">${ICO.ok}<span><span class="tipo">${esc(d.tipo === "Desconhecido" ? "Documento" : d.tipo)}</span> Lido com o Azure · confira os campos em amarelo</span></div>`);
  for (const src of d.imagens){ const im = document.createElement("img"); im.src = src; im.alt = "Documento"; im.onclick = () => { const z = document.createElement("div"); z.className = "zoom"; z.innerHTML = '<img alt="">'; z.firstChild.src = src; z.onclick = () => z.remove(); document.body.append(z); }; $("fImg").append(im); }
  $("vv").onclick = () => desenharLista();
  const F = document.createElement("div"); F.className = "campos";
  const presentes = DADOS.filter(([k]) => d.dados[k] && !OCULTOS.has(k)), vazios = DADOS.filter(([k]) => !d.dados[k] && !OCULTOS.has(k));
  const lin = ([k, rot]) => { const x = d.dados[k] || { valor: "", situacao: "falta" }; return `<div class="campo${x.situacao === "duvida" ? " duvida" : ""}" data-k="${k}"><label><span>${esc(rot)}</span>${x.situacao === "duvida" ? '<span class="duv">confira</span>' : ""}</label><input value="${esc(x.valor)}">${x.porque && x.situacao === "duvida" ? `<small>${esc(x.porque)}</small>` : ""}</div>`; };
  F.innerHTML = presentes.map(lin).join("") + `<div id="vazios" hidden class="campos">${vazios.map(lin).join("")}</div>`;
  c.append(F);
  if (vazios.length) F.insertAdjacentHTML("beforeend", `<button class="mais" id="bVazios">+ ${vazios.length} campos que não estão no documento</button>`);
  $("bVazios")?.addEventListener("click", e => { $("vazios").hidden = false; e.target.remove(); });
  F.querySelectorAll(".campo input").forEach(i => i.onchange = async () => {
    const k = i.closest(".campo").dataset.k, v = i.value.trim();
    if (v) d.dados[k] = { valor: v, situacao: "ok", porque: "" }; else delete d.dados[k];
    for (const f of ["filiacao1", "filiacao2"]) if (d.dados[f]?.de === k){ if (v) d.dados[f] = { ...d.dados[f], valor: v }; else delete d.dados[f]; }
    if (d.dados.orgao && d.dados.orgaoUf) d.dados.orgaoComUf = { valor: `${d.dados.orgao.valor}/${d.dados.orgaoUf.valor}`, situacao: [d.dados.orgao, d.dados.orgaoUf].some(x => x.situacao === "duvida") ? "duvida" : "ok", porque: "" }; else delete d.dados.orgaoComUf;
    const cp = i.closest(".campo"); cp.classList.remove("duvida"); cp.querySelector(".duv")?.remove(); cp.querySelector("small")?.remove();
    d.titulo = tituloDoc(d); await banco.salvarDoc(d);
  });
  c.insertAdjacentHTML("beforeend", `<div class="preencher"><button class="btn principal" id="bPreencher">${ICO.lapis}Preencher este formulário</button>
    <button class="btn leve" id="bApagar">Apagar este documento</button></div>`);
  $("bPreencher").onclick = () => preencher(d);
  $("bApagar").onclick = async () => { await banco.apagarDoc(d.id); await limparMarcas(); aviso("Documento apagado."); desenharLista(); };
}

// ================= preencher o site =================
async function injetar(tabId){
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["pagina/pagina.js"] });
}
async function varrerAba(tab){
  await injetar(tab.id);
  const r = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => window.__yuh && window.__yuh.varrer() });
  const campos = [];
  for (const fr of r){
    if (!fr.result) continue;
    const cs = fr.result.campos, cobertos = cs.filter(c => c.coberto).length;
    if (cs.length && cobertos / cs.length > 0.4) continue;   // tela de fundo, atrás de outra janela
    for (const c of cs) if (!c.coberto) campos.push({ ...c, id: `${fr.frameId}:${c.id}`, frame: fr.frameId, idLocal: c.id });
  }
  return campos;
}
async function limparMarcas(){
  const t = await abaAtual(); if (!t || !podeMexer(t.url)) return;
  try { await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, func: () => window.__yuh && window.__yuh.limpar() }); } catch {}
}
async function preencherCampos(tabId, campos, mapa, origem, d){
  const porFrame = {};
  const itens = [];
  for (const c of campos){
    const x = valorDaReceita(mapa[c.id], d.dados); if (!x) continue;
    const situacao = x.situacao === "duvida" || origem[c.id] === "ia" ? "duvida" : "ok";
    (porFrame[c.frame] ||= []).push({ id: c.idLocal, valor: x.valor, situacao });
    itens.push(c.id);
  }
  const res = {};
  for (const [fr, lista] of Object.entries(porFrame)){
    const r = await chrome.scripting.executeScript({ target: { tabId, frameIds: [+fr] }, func: l => window.__yuh.preencher(l), args: [lista] });
    for (const x of r[0]?.result || []) res[`${fr}:${x.id}`] = x;
  }
  return res;
}

async function preencher(d){
  const bt = $("bPreencher"); bt.disabled = true;
  C().querySelectorAll(".resultado,.erro,.ligacoes,#lendoIA,.p-sec.lig-t").forEach(x => x.remove());
  const tab = await abaAtual();
  const volta = () => { bt.disabled = false; bt.innerHTML = `${ICO.lapis}Preencher de novo`; };
  if (!tab || !podeMexer(tab.url)){ mostrarErro("Abra o site do formulário nesta janela e tente de novo."); bt.disabled = false; return; }
  let campos;
  try { campos = await varrerAba(tab); }
  catch (e) { mostrarErro("Não consegui ler esta página. " + (e.message || "")); bt.disabled = false; return; }
  if (!campos.length){ mostrarErro("Não achei campos para preencher nesta página. Se o formulário está em outra aba, abra ela e tente de novo."); bt.disabled = false; return; }

  const site = chaveDoSite(tab.url), aprendido = await banco.mapaDoSite(site);
  const { mapa, origem } = mapearPorDicionario(campos, aprendido);
  let erroIA = "";
  // site novo + IA ligada: a IA lê o formulário inteiro e faz a relação dos campos.
  // Nas próximas visitas vale o que foi aprendido (sem gastar IA). Sem IA, fica o dicionário.
  const siteNovo = !Object.keys(aprendido).length;
  const iaLigada = await temIA();
  const desconhecidos = siteNovo && iaLigada ? campos.filter(c => origem[c.id] !== "memoria") : campos.filter(c => mapa[c.id] == null);
  if (desconhecidos.length){
    if (iaLigada){
      const k = document.createElement("div"); k.className = "lendo"; k.id = "lendoIA";
      k.innerHTML = `<img class="kuru" src="${KURU}" alt=""><span>A IA está lendo o formulário… (só a estrutura, nunca os dados)</span>`;
      bt.closest(".preencher").before(k); k.scrollIntoView({ block: "nearest" });
      bt.textContent = "Entendendo o formulário…";
      try {
        const ia = await mapearComIA(campos, Object.keys(d.dados), Object.values(d.dados).map(x => x.valor));
        for (const c of desconhecidos){
          const k = ia[c.id] || "-";
          if (k === mapa[c.id]) continue;               // dicionário e IA concordam: fica verde
          mapa[c.id] = k; origem[c.id] = k === "-" ? "ia-nada" : "ia";
        }
      } catch (e) { erroIA = e.message || String(e); }
      k.remove();
    } else erroIA = "sem IA configurada";
  }
  // guarda o que aprendeu (dicionário e IA); o que ficou sem resposta não é guardado
  const novo = {};
  for (const c of campos) if (/^ia/.test(origem[c.id] || "")) novo[assinatura(c)] = mapa[c.id];
  if (Object.keys(novo).length) await banco.salvarMapa(site, novo);

  bt.textContent = "Preenchendo…";
  await limparMarcas();
  const res = await preencherCampos(tab.id, campos, mapa, origem, d);
  ultimoPreenchimento = { tab, site, campos, mapa, origem, res };
  mostrarResultado(d, erroIA);
  volta();
}

function mostrarErro(t){ const e = document.createElement("div"); e.className = "erro"; e.textContent = t; $("bPreencher").closest(".preencher").before(e); e.scrollIntoView({ block: "nearest" }); }

function mostrarResultado(d, erroIA){
  const { campos, mapa, origem, res } = ultimoPreenchimento;
  C().querySelectorAll(".resultado,.ligacoes,.p-sec.lig-t").forEach(x => x.remove());
  let verdes = 0, amarelos = 0; const semDado = [], falhou = [], naoEntendi = [];
  for (const c of campos){
    const k = mapa[c.id];
    if (k == null){ naoEntendi.push(c); continue; }
    if (k === "-") continue;
    if (!valorDaReceita(k, d.dados)){ semDado.push(c.rotulo || descreverReceita(k)); continue; }
    const r = res[c.id];
    if (!r || !r.ok){ falhou.push(`${c.rotulo}${r?.motivo ? ` (${r.motivo})` : ""}`); continue; }
    (valorDaReceita(k, d.dados).situacao === "duvida" || origem[c.id] === "ia") ? amarelos++ : verdes++;
  }
  const box = document.createElement("div"); box.className = "resultado" + (verdes + amarelos === 0 ? " ruim" : "");
  box.innerHTML = `<b>${verdes + amarelos ? "Pronto! Agora confira e envie no site." : "Não consegui preencher nada nesta página."}</b>
    ${verdes ? `<span class="l"><span class="q" style="background:#1E8A4C"></span>${verdes} campo${verdes > 1 ? "s" : ""} preenchido${verdes > 1 ? "s" : ""}</span>` : ""}
    ${amarelos ? `<span class="l"><span class="q" style="background:#d39b2a"></span>${amarelos} para conferir</span>` : ""}
    ${semDado.length ? `<span class="l"><span class="q" style="background:#c7d0da"></span>Sem dado no documento: ${esc(semDado.join(", "))}</span>` : ""}
    ${falhou.length ? `<span class="l"><span class="q" style="background:#B42318"></span>Não deu: ${esc(falhou.join("; "))}</span>` : ""}
    ${naoEntendi.length ? `<span class="l"><span class="q" style="background:#fff;border:1px dashed #5B6878"></span>${naoEntendi.length} campo${naoEntendi.length > 1 ? "s" : ""} que não entendi${erroIA === "sem IA configurada" ? " (ligue a IA na engrenagem ⚙, ou ensine abaixo)" : erroIA ? ` (IA: ${esc(erroIA)})` : ""}</span>` : ""}
    <span style="color:var(--tinta-2);font-size:12px">A Yuh Extension nunca clica em “Enviar”. Quem envia é você.</span>`;
  const p = $("bPreencher").closest(".preencher"); p.before(box);
  // ligações campo → dado (para corrigir/ensinar)
  const opts = k => `<option value="">— não sei —</option><option value="-"${k === "-" ? " selected" : ""}>Não preencher</option>`
    + (k && k !== "-" && !NOME_DADO[k] ? `<option value="${esc(k)}" selected>IA: ${esc(descreverReceita(k))}</option>` : "")
    + DADOS.map(([kk, r]) => `<option value="${kk}"${kk === k ? " selected" : ""}>${esc(r)}${d.dados[kk] ? "" : " (vazio)"}</option>`).join("");
  const visiveis = campos.filter(c => mapa[c.id] !== "-" || origem[c.id] === "ia-nada");
  p.insertAdjacentHTML("beforebegin", `<div class="p-sec lig-t"><span>O que foi em cada campo</span><span>corrija e a Yuh aprende</span></div>`);
  const L = document.createElement("div"); L.className = "ligacoes";
  for (const c of visiveis){
    const k = mapa[c.id];
    const row = document.createElement("div"); row.className = "lig" + (origem[c.id] === "ia" ? " ia" : "") + (k == null ? " nao" : "");
    row.innerHTML = `<span class="r" title="Mostrar no site">${esc(c.rotulo || c.nome || "(sem nome)")}<small>${esc(c.contexto || (origem[c.id] === "ia" ? "entendido pela IA" : ""))}</small></span><select>${opts(k)}</select>`;
    row.querySelector(".r").onclick = () => chrome.scripting.executeScript({ target: { tabId: ultimoPreenchimento.tab.id, frameIds: [c.frame] }, func: id => window.__yuh.destacar(id), args: [c.idLocal] });
    row.querySelector("select").onchange = async e => ensinar(d, c, e.target.value || null);
    L.append(row);
  }
  p.before(L);
  box.scrollIntoView({ block: "nearest" });
}

async function ensinar(d, c, k){
  const u = ultimoPreenchimento; if (!u) return;
  u.mapa[c.id] = k; u.origem[c.id] = "pessoa";
  if (k != null) await banco.salvarMapa(u.site, { [assinatura(c)]: k });
  const x = valorDaReceita(k, d.dados);
  if (x){
    const r = await chrome.scripting.executeScript({ target: { tabId: u.tab.id, frameIds: [c.frame] }, func: l => window.__yuh.preencher(l), args: [[{ id: c.idLocal, valor: x.valor, situacao: x.situacao }]] });
    u.res[c.id] = { ...(r[0]?.result?.[0] || {}), id: c.idLocal };
  }
  aviso(k == null ? "Ok." : "Aprendido para este site.");
  mostrarResultado(d, "");
}

// ================= configurações =================
async function abrirConfig(){
  tela = "config";
  const cfg = await banco.config(), n = await banco.leiturasDoMes(), sites = await banco.sitesConhecidos();
  const c = C(); c.innerHTML = "";
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Voltar</button>
  <div class="cfg">
    <h3>Leitura de documentos · Microsoft Azure</h3>
    <p>No portal do Azure: recurso <b>yuh-leitura</b> → <b>Chaves e Ponto de extremidade</b>.</p>
    <div class="campo"><label>Ponto de extremidade</label><input id="cPonto" placeholder="https://….cognitiveservices.azure.com/" value="${esc(cfg.azurePonto || "")}"></div>
    <div class="campo"><label>Chave 1 ${cfg.azureChave ? '<span class="ok-txt">✓ guardada</span>' : ""}</label><input id="cChave" type="password" placeholder="${cfg.azureChave ? "(deixe em branco para manter)" : "cole a CHAVE 1"}"></div>
    <p>Este mês, neste PC: <b>${n}</b> leituras (trava em ${banco.LIMITE_MES}; o grátis vai até 5000).</p>

    <h3>IA para formulários novos · Gemini (grátis)</h3>
    <p>Crie a chave em <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a> com sua conta Google. A IA recebe só os nomes dos campos dos sites, nunca dados de clientes.</p>
    <div class="campo"><label>Chave do Gemini ${cfg.geminiChave ? '<span class="ok-txt">✓ guardada</span>' : ""}</label><input id="cGemini" type="password" placeholder="${cfg.geminiChave ? "(deixe em branco para manter)" : "cole a chave (começa com AIza)"}"></div>
    <button class="btn principal" id="cSalvar">Salvar</button>

    <h3>Privacidade</h3>
    <p>As chaves e os documentos ficam só neste Chrome. Os documentos somem sozinhos em 24 h.</p>
    <button class="btn leve" id="cApagarDocs">Apagar todos os documentos agora</button>
    <p>Sites que a Yuh já aprendeu: <b>${sites.length}</b></p>
    <button class="btn leve" id="cEsquecer"${sites.length ? "" : " disabled"}>Esquecer o que aprendeu dos sites</button>
    <p style="margin-top:8px">Yuh Extension ${chrome.runtime.getManifest().version}</p>
  </div>`);
  $("vv").onclick = () => desenharLista();
  $("cSalvar").onclick = async () => {
    const ponto = $("cPonto").value.trim().replace(/\/+$/, ""), chave = $("cChave").value.trim(), gem = $("cGemini").value.trim();
    if (ponto && !/^https:\/\/[\w.-]+\.(cognitiveservices\.azure\.com|api\.cognitive\.microsoft\.com)$/.test(ponto)) return aviso("O ponto de extremidade não parece certo (termina com cognitiveservices.azure.com).");
    if (chave && !/^\w{20,}$/.test(chave)) return aviso("A chave do Azure não parece certa.");
    if (gem && !/^AIza[\w-]{20,}$/.test(gem)) return aviso("A chave do Gemini começa com AIza.");
    const novo = { azurePonto: ponto }; if (chave) novo.azureChave = chave; if (gem) novo.geminiChave = gem;
    await banco.salvarConfig(novo); aviso("Salvo."); abrirConfig();
  };
  $("cApagarDocs").onclick = async () => { await banco.apagarTodosDocs(); await limparMarcas(); aviso("Documentos apagados."); };
  $("cEsquecer").onclick = async () => { await banco.esquecerMapas(); aviso("Pronto: a Yuh esqueceu os sites."); abrirConfig(); };
}
$("bConfig").onclick = () => tela === "config" ? desenharLista() : abrirConfig();

// troca de aba: a nota do site muda
chrome.tabs.onActivated.addListener(() => { if (tela === "lista") desenharLista(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === "complete" && tela === "lista") desenharLista(); });

desenharLista();
