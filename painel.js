// Yuh Extension — painel lateral.
import * as banco from "./lib/banco.js";
import { prepararFoto, lerFoto } from "./lib/azure.js";
import { paginasDoPdf, MAX_PAGINAS } from "./lib/pdf.js";
import { minhaCaixa, celulares, desconectarCelular, textoDoQr, abrirPareamento, fecharPareamento, pareamentoAberto, olharCaixa, carteiro } from "./lib/celular.js";
import { yuhAberto, listarDoPc, baixarDoPc, gradeAtual, baixarGrade, recursosDoYuh } from "./lib/yuhpc.js";
import { montarFicha, tituloDoc, completar, valorDaReceita, descreverReceita, DADOS, NOME_DADO } from "./lib/ficha.js";
import { assinatura, chaveDoSite, mapearPorDicionario } from "./lib/campos.js";
import { mapearComIA, temIA } from "./lib/gemini.js";
import { temCentral, central, guardarSenha } from "./lib/central.js";
import { SENHA_MUDOU } from "./lib/azure.js";
chrome.runtime.sendMessage("yuh-conferir-versao").catch(() => {});   // pasta atualizada pelo Yuh Scanner? recarrega

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
    <button class="imp" id="impYuh"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="8" rx="1.5"/><path d="M6 11V5h9l3 3v3"/><path d="M7 15h10"/></svg>Importar do Yuh Scanner<small>Digitalizados neste PC</small></button>
    <button class="imp" id="impArq"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg>Importar documentos<small>PDF ou foto do computador</small></button>
  </div>`);
  const lista = await banco.docs();
  c.insertAdjacentHTML("beforeend", `<div class="p-sec"><span>Documentos lidos</span><span>somem sozinhos em 24 h</span></div>`);
  if (!lista.length) c.insertAdjacentHTML("beforeend", `<div class="vazio-p">Nenhum ainda. Clique em <b>Importar documentos</b> e escolha a foto (ou frente e verso) de um RG, CNH ou certidão.</div>`);
  for (const d of lista){
    const b = document.createElement("button"); b.className = "doc" + (d.id === novoId ? " novo" : "");
    b.innerHTML = `<img alt=""><span class="inf"><b></b><small></small></span><span class="origem"></span>`;
    b.querySelector(".origem").textContent = d.origem || "🖥 PC";
    b.querySelector("img").src = d.imagens[0]; b.querySelector("b").textContent = d.titulo;
    const n = Object.values(d.dados).filter(x => x.situacao === "duvida").length;
    b.querySelector("small").textContent = `${d.tipo === "Desconhecido" ? "Documento" : d.tipo} · ${n ? n + " para conferir" : "tudo lido"}`;
    b.onclick = () => abrirFicha(d.id);
    c.append(b);
  }
  if (!(await temCentral())) caixaDaSenha(c);
  await notaDoSite(c);
  $("impArq").onclick = () => $("arq").click();
  $("impYuh").onclick = () => importarDoYuh();
  atualizarChipPc(); atualizarChipCel();
}
// "Senha do cartório": digitada uma vez (o Iuri passa). Sem ela a Yuh não lê nem usa a IA.
function caixaDaSenha(c){
  c.insertAdjacentHTML("afterbegin", `<div class="senha-caixa" id="senhaCaixa">
    <b>Senha do cartório</b>
    <span>Só na primeira vez. Peça ao Iuri e cole aqui.</span>
    <div class="senha-linha"><input id="senhaIn" type="password" autocomplete="off" placeholder="cole a senha"><button class="btn principal" id="senhaOk">Salvar</button></div>
  </div>`);
  const ok = async () => {
    const b = $("senhaOk"); b.disabled = true; b.textContent = "Conferindo…";
    try { await guardarSenha($("senhaIn").value); aviso("Senha guardada. Pode usar a Yuh!"); desenharLista(); }
    catch (e) { aviso(e.message); b.disabled = false; b.textContent = "Salvar"; }
  };
  $("senhaOk").onclick = ok;
  $("senhaIn").onkeydown = e => { if (e.key === "Enter") ok(); };
}
async function atualizarChipCel(){
  const cs = await celulares(), ch = $("chipCel"); if (!ch) return;
  ch.className = "chip" + (cs.length ? "" : " off");
  ch.innerHTML = cs.length ? `<i></i>Celular: ${esc(cs[0].nome)}${cs.length > 1 ? ` +${cs.length - 1}` : ""}` : `<i></i>Nenhum celular <button id="chipCon">Conectar</button>`;
  $("chipCon")?.addEventListener("click", () => abrirConectarCelular());
}
async function atualizarChipPc(){
  const ok = await yuhAberto(), ch = $("chipPc"); if (!ch) return;
  ch.className = "chip" + (ok ? "" : " off");
  ch.innerHTML = `<i></i>${ok ? "Yuh Scanner do PC" : "Yuh Scanner do PC · fechado"}`;
  ch.title = ok ? "Yuh Scanner para Windows aberto neste PC" : "Abra o Yuh Scanner neste PC para importar o que você digitalizou";
}

// ================= importar do Yuh Scanner do PC =================
async function importarDoYuh(){
  tela = "yuh";
  const c = C(); c.innerHTML = "";
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Voltar</button><div class="p-sec"><span>Yuh Scanner deste PC</span></div><div id="listaPc" class="campos"><div class="lendo"><img class="kuru" src="${KURU}" alt=""><span>Procurando o Yuh Scanner…</span></div></div>`);
  $("vv").onclick = () => desenharLista();
  let docs;
  try { docs = await listarDoPc(); }
  catch {
    $("listaPc").innerHTML = `<div class="vazio-p">Não encontrei o Yuh Scanner aberto neste PC.<br>Abra o Yuh Scanner (versão 0.8 ou mais nova) e tente de novo.</div><button class="btn leve" id="tentar">Tentar de novo</button>`;
    $("tentar").onclick = importarDoYuh; return;
  }
  const L = $("listaPc"); L.innerHTML = `<div class="lendo" id="lendoGrade"><img class="kuru" src="${KURU}" alt=""><span>Pegando o que está na tela do Yuh Scanner…</span></div>`;
  // 1º: o que está no grid agora (mesmo sem salvar)
  const recursos = await recursosDoYuh() || [];
  const g = recursos.includes("grade") ? await gradeAtual() : null;
  $("lendoGrade")?.remove();
  if (!recursos.includes("grade")) L.insertAdjacentHTML("beforeend", `<div class="mapa">${ICO.info}<span><b>Este Yuh Scanner é de uma versão antiga</b> e só mostra o que foi salvo. Para pegar também o que está na tela sem salvar, abra a versão mais nova.</span></div>`);
  else if (!g) L.insertAdjacentHTML("beforeend", `<div class="vazio-p">Não consegui pegar o que está na tela do Yuh Scanner (a janela não respondeu). Tente de novo.</div>`);
  if (g && g.paginas > 0){
    const b = document.createElement("button"); b.className = "doc";
    b.innerHTML = `<img alt=""><span class="inf"><b></b><small></small></span><span class="origem">na tela</span>`;
    b.querySelector("b").textContent = g.nome || "Na tela do Yuh Scanner agora";
    b.querySelector("small").textContent = `${g.paginas} pág. · na tela agora, sem salvar`;
    b.onclick = async () => {
      b.disabled = true;
      try { lerArquivos(await baixarGrade(g, 4), "🖥 PC"); }
      catch (e) { b.disabled = false; aviso(e.message || String(e)); }
    };
    L.append(b);
    baixarGrade(g, 1).then(([f]) => { if (f) b.querySelector("img").src = URL.createObjectURL(f); }).catch(() => {});
  }
  if (docs.length) L.insertAdjacentHTML("beforeend", `<div class="p-sec"><span>Salvos nas últimas 24 h</span></div>`);
  if (!docs.length && !(g && g.paginas)){ L.innerHTML = `<div class="vazio-p">O Yuh Scanner está aberto, mas não tem nada na tela nem salvo nas últimas 24 horas.<br>Digitalize lá e volte aqui.</div>`; return; }
  for (const d of docs){
    const b = document.createElement("button"); b.className = "doc";
    const quando = new Date(d.quando);
    b.innerHTML = `<img alt=""><span class="inf"><b></b><small></small></span><span class="origem">🖥 PC</span>`;
    b.querySelector("b").textContent = d.nome;
    b.querySelector("small").textContent = `${d.tipo === "pdf" ? "PDF" : "Imagem"} · ${d.paginas} pág. · ${quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
    b.onclick = async () => {
      b.disabled = true;
      try { lerArquivos(await baixarDoPc(d), "🖥 PC"); }
      catch (e) { b.disabled = false; aviso(e.message || String(e)); }
    };
    L.append(b);
    miniaturaPc(d, b.querySelector("img"));
  }
}
async function miniaturaPc(d, img){
  try {
    const [arq] = await baixarDoPc({ ...d, arquivos: 1 });
    const blob = arq.type === "application/pdf" ? (await paginasDoPdf(arq, 1)).fotos[0]?.blob : arq;
    if (blob) img.src = URL.createObjectURL(blob);
  } catch {}
}
async function notaDoSite(c){
  const t = await abaAtual(); if (!t || !podeMexer(t.url)) return;
  const site = chaveDoSite(t.url), conhecido = Object.keys(await banco.mapaDoSite(site)).length > 0;
  c.insertAdjacentHTML("beforeend", `<div class="mapa">${ICO.info}<span>${conhecido ? `<b>Este site já é conhecido.</b> A Yuh lembra o que vai em cada campo.` : `<b>Site novo para a Yuh.</b> Na primeira vez ela lê <b>só os nomes dos campos</b> do formulário (nunca os dados) e guarda o que aprendeu.`}</span></div>`);
}

// ================= importar e ler =================
$("arq").onchange = () => { const fs = [...$("arq").files]; $("arq").value = ""; if (fs.length) lerArquivos(fs, "🖥 PC"); };
// lê os arquivos e guarda a ficha (sem mexer na tela); msg/miniatura são opcionais
async function processarArquivos(fs, origem, { msg = () => {}, miniatura = () => {} } = {}){
  const fotos = [];
  for (const f of fs){
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)){
      msg("Abrindo o PDF…");
      const { fotos: pgs, total } = await paginasDoPdf(f);
      if (total > MAX_PAGINAS) aviso(`O PDF tem ${total} páginas; li só as ${MAX_PAGINAS} primeiras.`);
      for (const pg of pgs){ const p = await prepararFoto(pg.blob); fotos.push(p); miniatura(p.miniatura); }
    } else { const p = await prepararFoto(f); fotos.push(p); miniatura(p.miniatura); }
  }
  const textos = [], conf = new Map();
  for (let i = 0; i < fotos.length; i++){
    msg(fotos.length > 1 ? `Lendo a foto ${i + 1} de ${fotos.length}…` : "Lendo o documento…");
    const r = await lerFoto(fotos[i].blob); textos.push(r.texto);
    for (const [k, v] of r.conf) conf.set(k, Math.min(conf.get(k) ?? 1, v));
  }
  const ficha = montarFicha(textos.join("\n"), conf);
  const doc = { id: crypto.randomUUID(), criado: Date.now(), tipo: ficha.tipo, dados: ficha.dados, imagens: fotos.map(f => f.miniatura), origem };
  doc.titulo = tituloDoc(doc);
  await banco.salvarDoc(doc);
  return doc;
}
async function lerArquivos(fs, origem){
  const c = C(); c.innerHTML = ""; tela = "lendo";
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Documentos</button><div class="ficha-img" id="fImg"></div><div class="lendo" id="fLendo"><img class="kuru" src="${KURU}" alt=""><span id="fMsg">Preparando ${fs.length > 1 ? "as fotos" : "a foto"}…</span></div>`);
  $("vv").onclick = () => desenharLista();
  try {
    const doc = await processarArquivos(fs, origem, {
      msg: t => { if ($("fMsg")) $("fMsg").textContent = t; },
      miniatura: src => { const im = document.createElement("img"); im.src = src; $("fImg")?.append(im); },
    });
    abrirFicha(doc.id);
  } catch (e) {
    if ($("fLendo")) $("fLendo").outerHTML = `<div class="erro">${esc(e.message || e)}</div>`;
  }
}

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

// ================= conectar celular =================
let qrTimer = null;
async function abrirConectarCelular(){
  tela = "par"; clearInterval(qrTimer);
  const c = C(); c.innerHTML = "";
  const cfg = await banco.config();
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Voltar</button><div class="pareamento" id="parBox"><b style="font-size:16px">Conectar um celular</b></div>
    <div class="p-sec"><span>Celulares conectados a este navegador</span></div><div class="pcs" id="listaCel"></div>`);
  $("vv").onclick = () => { fecharPareamento(); clearInterval(qrTimer); desenharLista(); };
  desenharCelulares();
  if (!(await carteiro())){
    $("parBox").insertAdjacentHTML("beforeend", `<div class="erro">Falta o endereço do carteiro (⚙ → Celular).</div>`); return;
  }
  const texto = await textoDoQr(cfg.nomePc || "Chrome deste PC");
  const q = qrcode(0, "M"); q.addData(texto); q.make();
  $("parBox").insertAdjacentHTML("beforeend", `<img class="qr" id="qr" alt="QR Code para conectar" src="${q.createDataURL(6, 2)}">
    <span class="tempo" id="tempo"></span>
    <span style="color:var(--tinta-2);font-size:13px">No <b>Yuh Scanner Mobile</b>: menu ⋮ → <b>Conectar ao PC</b> e aponte a câmera para este código (ou use a câmera comum do celular). É uma vez só por celular.</span>`);
  abrirPareamento(120);
  let resta = 120;
  const t = () => {
    if (!$("tempo")) return clearInterval(qrTimer);
    $("tempo").innerHTML = resta > 0 ? `Código válido por <b>${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, "0")}</b>` : `Código vencido · <button class="voltar" id="novoQr">gerar outro</button>`;
    if (resta <= 0){ $("qr")?.classList.add("vencido"); $("novoQr")?.addEventListener("click", abrirConectarCelular); clearInterval(qrTimer); fecharPareamento(); }
  };
  t(); qrTimer = setInterval(() => { resta--; t(); }, 1000);
  olharJa();
}
async function desenharCelulares(){
  const L = $("listaCel"); if (!L) return;
  const cs = await celulares();
  L.innerHTML = cs.length ? "" : `<div class="vazio-p">Nenhum ainda.</div>`;
  for (const x of cs){
    const r = document.createElement("div"); r.className = "pc-item";
    r.innerHTML = `<span style="flex:1"><b></b><small>conectado em ${new Date(x.quando).toLocaleDateString("pt-BR")}</small></span><button class="voltar" style="align-self:center;color:var(--carimbo)">Desconectar</button>`;
    r.querySelector("b").textContent = x.nome;
    r.querySelector("button").onclick = async () => { await desconectarCelular(x.id); aviso(`${x.nome} desconectado.`); desenharCelulares(); atualizarChipCel(); };
    L.append(r);
  }
}
$("bCel").onclick = () => tela === "par" ? (fecharPareamento(), desenharLista()) : abrirConectarCelular();

// olha a caixa do carteiro: rápido enquanto o QR está na tela, a cada 5 s se há celular conectado
let olhando = false, filaCel = Promise.resolve();
async function olharJa(){
  if (olhando) return; olhando = true;
  try {
    const eventos = await olharCaixa();
    const docsCel = eventos.filter(ev => ev.tipo === "doc");
    for (const ev of eventos){
      if (ev.tipo === "par" && $("parBox")){
        clearInterval(qrTimer);
        $("parBox").innerHTML = `<b style="font-size:16px">${esc(ev.nome)} quer se conectar</b>
          <span style="color:var(--tinta-2);font-size:13px">Confira se o celular mostra o mesmo código:</span>
          <div class="codigo">${[...ev.codigo].map(d => `<span>${d}</span>`).join("")}</div>
          <div class="lendo" style="width:100%"><img class="kuru" src="${KURU}" alt=""><span>Esperando você confirmar no celular…</span></div>`;
      } else if (ev.tipo === "conectado"){
        if ($("parBox")) $("parBox").innerHTML = `<div class="resultado" style="width:100%"><b>${esc(ev.nome)} conectado ✓</b><span>Os documentos que estão no celular já vêm para cá. Depois, é só usar “Levar para o formulário no PC”.</span></div>`;
        desenharCelulares(); atualizarChipCel(); aviso(`${ev.nome} conectado.`);
      } else if (ev.tipo === "desconectou"){ atualizarChipCel(); desenharCelulares(); }
    }
    if (docsCel.length === 1) receberDoCelular(docsCel[0]);
    else if (docsCel.length > 1) receberVariosDoCelular(docsCel);
  } catch {} finally { olhando = false; }
}
function arquivosDoCelular(ev){
  return ev.imagens.map((src, i) => { const [cab, b] = src.split(","); const bin = atob(b); const u8 = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j); return new File([u8], `${ev.docNome}_${i + 1}.jpg`, { type: /png/.test(cab) ? "image/png" : "image/jpeg" }); });
}
function receberDoCelular(ev){
  const arqs = arquivosDoCelular(ev);
  if (tela === "lista" || tela === "yuh" || tela === "par"){ lerArquivos(arqs, "📱 celular"); return; }
  // ocupado numa ficha ou preenchendo: lê por trás e avisa
  aviso(`Chegou do celular (${ev.nome}): ${ev.docNome}. Lendo…`);
  filaCel = filaCel.then(() => processarArquivos(arqs, "📱 celular")).then(d => aviso(`Pronto: ${d.titulo} está em Documentos.`)).catch(e => aviso("Não consegui ler o que veio do celular: " + (e.message || e)));
}
// vários de uma vez (o celular manda tudo assim que conecta): lê um por um, por trás, e vai pondo na lista
function receberVariosDoCelular(evs){
  if (tela === "par" || tela === "yuh") desenharLista();
  aviso(`Chegaram ${evs.length} documentos do celular. Lendo um por um…`);
  evs.forEach((ev, i) => {
    filaCel = filaCel.then(() => processarArquivos(arquivosDoCelular(ev), "📱 celular"))
      .then(d => { if (tela === "lista") desenharLista(d.id); aviso(`Lido ${i + 1} de ${evs.length}: ${d.titulo}`); })
      .catch(e => aviso(`Não consegui ler ${ev.docNome}: ` + (e.message || e)));
  });
}
setInterval(async () => { if (pareamentoAberto() || (await celulares()).length) olharJa(); }, 4000);

// ================= configurações =================
async function abrirConfig(){
  tela = "config";
  const cfg = await banco.config(), sites = await banco.sitesConhecidos(), comCentral = await temCentral();
  const c = C(); c.innerHTML = "";
  const chaves = `
    <h3>Leitura e IA</h3>
    <p id="cUso">${comCentral ? "Usando a central do cartório…" : "Falta a senha do cartório: ela aparece na tela inicial da Yuh."}</p>`;
  c.insertAdjacentHTML("beforeend", `<button class="voltar" id="vv">‹ Voltar</button>
  <div class="cfg">${chaves}
    <h3>Celular · Yuh Scanner Mobile</h3>
    <div class="campo"><label>Nome deste computador (aparece no celular)</label><input id="cNomePc" value="${esc(cfg.nomePc || "")}" placeholder="ex.: PC do balcão"></div>
    <button class="btn principal" id="cSalvar">Salvar</button>

    <h3>Privacidade</h3>
    <p>Os documentos ficam só neste Chrome e somem sozinhos em 24 h.</p>
    <button class="btn leve" id="cApagarDocs">Apagar todos os documentos agora</button>
    <p>Sites que a Yuh já aprendeu: <b>${sites.length}</b></p>
    <button class="btn leve" id="cEsquecer"${sites.length ? "" : " disabled"}>Esquecer o que aprendeu dos sites</button>
    <p style="margin-top:8px">Yuh Extension ${chrome.runtime.getManifest().version}</p>
  </div>`);
  $("vv").onclick = () => desenharLista();
  if (comCentral) central("/v1/uso", { metodo: "GET" }).then(r => r.status === 401 ? { erro: SENHA_MUDOU } : r.json()).then(u => {
    if (!$("cUso")) return;
    $("cUso").innerHTML = u.erro ? `<span class="erro" style="display:block">${esc(u.erro)}</span>`
      : `<span class="ok-txt">✓ Usando a central do cartório</span> · <b>${u.leituras}</b> de ${u.limite} leituras este mês (o cartório todo).`;
  }).catch(e => { if ($("cUso")) $("cUso").textContent = e.message || "Não consegui falar com a central."; });
  $("cSalvar").onclick = async () => {
    const novo = { nomePc: $("cNomePc").value.trim().slice(0, 40) };
    await banco.salvarConfig(novo); aviso("Salvo."); abrirConfig();
  };
  $("cApagarDocs").onclick = async () => { await banco.apagarTodosDocs(); await limparMarcas(); aviso("Documentos apagados."); };
  $("cEsquecer").onclick = async () => { await banco.esquecerMapas(); aviso("Pronto: a Yuh esqueceu os sites."); abrirConfig(); };
}
// com a central, chaves antigas guardadas neste PC não servem mais: apaga
(async () => {
  if (!(await temCentral())) return;
  const cfg = await banco.config();
  if (cfg.azureChave || cfg.geminiChave || cfg.azurePonto){ const { azureChave, geminiChave, azurePonto, ...resto } = cfg; await chrome.storage.local.set({ config: resto }); }
})();
$("bConfig").onclick = () => tela === "config" ? desenharLista() : abrirConfig();

// troca de aba: a nota do site muda
chrome.tabs.onActivated.addListener(() => { if (tela === "lista") desenharLista(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === "complete" && tela === "lista") desenharLista(); });

desenharLista();
