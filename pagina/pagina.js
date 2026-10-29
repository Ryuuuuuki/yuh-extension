// Yuh Extension — roda DENTRO da página do site (em cada quadro/iframe).
// varrer(): descreve os campos do formulário (rótulo, tipo, opções) — sem ler o que está digitado.
// preencher(lista): coloca os valores, pinta de verde/amarelo e avisa o site (eventos de digitação).
// Nunca clica em botões nem envia o formulário.
(() => {
  if (window.__yuh) return;
  let seq = 0;
  const so = s => (s || "").replace(/\s+/g, " ").trim();
  const sem = s => so(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const limpaRot = s => so(s).replace(/[*:]+\s*$/, "").replace(/^\s*[*]+/, "").replace(/\(\s*obrigat[oó]rio\s*\)/i, "").trim().slice(0, 90);

  function visivel(el){
    if (!el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && parseFloat(st.opacity || "1") > 0.05;
  }
  // texto de um elemento sem o texto dos campos dentro dele (ex.: <label>Sexo<select>…</select></label>)
  function textoSemCampos(n){
    const c = n.cloneNode(true);
    c.querySelectorAll("input,select,textarea,button,script,style,option").forEach(x => x.remove());
    return so(c.textContent);
  }
  const curto = t => t && t.length <= 80 && /\p{L}{2}/u.test(t);

  function rotulo(el){
    if (el.labels && el.labels.length){ const t = textoSemCampos(el.labels[0]); if (curto(t)) return t; }
    const lb = el.getAttribute("aria-labelledby");
    if (lb){ const t = so(lb.split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ")); if (curto(t)) return t; }
    const al = el.getAttribute("aria-label"); if (curto(so(al))) return so(al);
    // tabela: célula da esquerda, ou cabeçalho da coluna
    const td = el.closest("td,th");
    if (td){
      let p = td.previousElementSibling;
      while (p){ const t = textoSemCampos(p); if (curto(t)) return t; if (p.querySelector("input,select,textarea")) break; p = p.previousElementSibling; }
    }
    // texto logo antes (irmãos anteriores, subindo até 4 níveis)
    let n = el;
    for (let nivel = 0; nivel < 4 && n && n !== document.body; nivel++){
      let p = n.previousElementSibling, passos = 0;
      while (p && passos < 3){
        if (p.matches("input,select,textarea") || p.querySelector("input,select,textarea")) { p = null; break; }
        const t = textoSemCampos(p); if (curto(t)) return t;
        p = p.previousElementSibling; passos++;
      }
      // texto solto no mesmo pai antes do campo ("Nome: <input>")
      if (n.parentElement){
        let txt = "";
        for (const c of n.parentElement.childNodes){ if (c === n) break; if (c.nodeType === 3) txt += c.textContent; else if (c.nodeType === 1 && !c.matches("input,select,textarea") && !c.querySelector("input,select,textarea")) txt += " " + c.textContent; else txt = ""; }
        if (curto(so(txt))) return so(txt);
      }
      n = n.parentElement;
    }
    const ph = so(el.getAttribute("placeholder")); if (curto(ph) && !/^[\d_.\/-]+$/.test(ph) && !/^(dd|xx|0)/i.test(ph)) return ph;
    const ti = so(el.getAttribute("title")); if (curto(ti)) return ti;
    const nm = el.getAttribute("name") || el.id || "";
    return so(nm.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-\[\].]+/g, " "));
  }
  function contexto(el){
    const fs = el.closest("fieldset"); const lg = fs && fs.querySelector("legend");
    if (lg) return so(lg.textContent).slice(0, 60);
    const sec = el.closest("[aria-label],section[aria-labelledby]");
    if (sec && sec.getAttribute("aria-label")) return so(sec.getAttribute("aria-label")).slice(0, 60);
    let ultimo = "";
    for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,legend,.titulo,.title,[role=heading]")){
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ultimo = so(h.textContent); else break;
    }
    return ultimo.slice(0, 60);
  }

  function varrer(){
    const campos = [], radios = new Set();
    for (const el of document.querySelectorAll("input,select,textarea")){
      const tipo = el.tagName === "INPUT" ? (el.type || "text").toLowerCase() : el.tagName.toLowerCase();
      if (/^(hidden|submit|button|reset|image|file|password|checkbox|color|range|search)$/.test(tipo)) continue;
      if (el.disabled || el.readOnly || !visivel(el)) continue;
      if (tipo === "radio"){ if (!el.name || radios.has(el.name)) continue; radios.add(el.name); }
      if (!el.dataset.yuh) el.dataset.yuh = String(++seq);
      const c = { id: el.dataset.yuh, tipo, rotulo: limpaRot(rotulo(el)), nome: el.getAttribute("name") || el.id || "", placeholder: so(el.getAttribute("placeholder")), contexto: contexto(el), max: el.maxLength > 0 ? el.maxLength : 0 };
      if (tipo === "select") c.opcoes = [...el.options].map(o => so(o.textContent)).filter(Boolean).slice(0, 80);
      if (tipo === "radio"){
        const grupo = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
        c.opcoes = grupo.map(r => limpaRot(r.labels?.[0] ? textoSemCampos(r.labels[0]) : so(r.nextSibling?.textContent) || r.value));
        // rótulo do grupo: legenda/texto antes do primeiro
        const fs = el.closest("fieldset"); const lg = fs && fs.querySelector("legend");
        c.rotulo = limpaRot(lg ? lg.textContent : rotulo(el.closest("div,p,td,span") || el));
      }
      campos.push(c);
    }
    return { url: location.href, titulo: document.title, campos };
  }

  // ---------- preencher ----------
  const COR = { ok: ["#1E8A4C", "#E5F6EC"], duvida: ["#D39B2A", "#FFF4DC"] };
  function pintar(el, sit){
    const [b, f] = COR[sit] || COR.duvida;
    if (el.dataset.yuhEstilo === undefined) el.dataset.yuhEstilo = el.getAttribute("style") || "";
    el.style.setProperty("outline", `2px solid ${b}`, "important");
    el.style.setProperty("outline-offset", "1px", "important");
    el.style.setProperty("background-color", f, "important");
    el.title = sit === "ok" ? "Preenchido pela Yuh" : "Preenchido pela Yuh — confira";
    const tirar = () => { despintar(el); el.removeEventListener("input", tirar); };
    el.addEventListener("input", e => { if (e.isTrusted) tirar(); });
  }
  function despintar(el){
    if (el.dataset.yuhEstilo === undefined) return;
    if (el.dataset.yuhEstilo) el.setAttribute("style", el.dataset.yuhEstilo); else el.removeAttribute("style");
    delete el.dataset.yuhEstilo; if (/^Preenchido pela Yuh/.test(el.title)) el.removeAttribute("title");
  }
  // muda o valor do jeito que React/Angular/Vue percebem
  function porValor(el, v){
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus({ preventScroll: true });
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    el.blur();
  }
  const UF_NOME = { AC: "ACRE", AL: "ALAGOAS", AP: "AMAPA", AM: "AMAZONAS", BA: "BAHIA", CE: "CEARA", DF: "DISTRITO FEDERAL", ES: "ESPIRITO SANTO", GO: "GOIAS", MA: "MARANHAO", MT: "MATO GROSSO", MS: "MATO GROSSO DO SUL", MG: "MINAS GERAIS", PA: "PARA", PB: "PARAIBA", PR: "PARANA", PE: "PERNAMBUCO", PI: "PIAUI", RJ: "RIO DE JANEIRO", RN: "RIO GRANDE DO NORTE", RS: "RIO GRANDE DO SUL", RO: "RONDONIA", RR: "RORAIMA", SC: "SANTA CATARINA", SP: "SAO PAULO", SE: "SERGIPE", TO: "TOCANTINS" };
  function melhorOpcao(textos, valor){
    const v = sem(valor).replace(/[^A-Z0-9 ]+/g, " ").trim(), alvo = [v];
    if (UF_NOME[v]) alvo.push(UF_NOME[v]);
    if (/^(M|MASCULINO)$/.test(v)) alvo.push("MASCULINO", "M", "MASC", "HOMEM");
    if (/^(F|FEMININO)$/.test(v)) alvo.push("FEMININO", "F", "FEM", "MULHER");
    if (v === "BRASILEIRA") alvo.push("BRASILEIRO", "BRASILEIRO(A)", "BRASILEIRA(O)", "BRASIL", "BRASILEIRO NATO", "BRASILEIRA NATA");
    if (v === "RG") alvo.push("CARTEIRA DE IDENTIDADE", "IDENTIDADE", "RG - REGISTRO GERAL", "CIN", "CARTEIRA DE IDENTIDADE NACIONAL");
    if (v === "CNH") alvo.push("CARTEIRA NACIONAL DE HABILITACAO", "CARTEIRA DE MOTORISTA", "HABILITACAO");
    const T = textos.map(t => sem(t).replace(/[^A-Z0-9() ]+/g, " ").replace(/\s+/g, " ").trim());
    for (const a of alvo){ const i = T.indexOf(a); if (i >= 0) return i; }
    for (const a of alvo){ if (a.length < 2) continue; const i = T.findIndex(t => t.startsWith(a + " ") || t.startsWith(a + " -") || t.startsWith(a + "(") || t.endsWith(" " + a) || t.endsWith("- " + a)); if (i >= 0) return i; }
    for (const a of alvo){ if (a.length < 4) continue; const i = T.findIndex(t => t.includes(a)); if (i >= 0) return i; }
    return -1;
  }
  function paraData(v){ const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); return m ? `${m[3]}-${m[2]}-${m[1]}` : v; }

  function preencher(lista){
    const res = [];
    for (const it of lista){
      const el = document.querySelector(`[data-yuh="${it.id}"]`);
      if (!el){ res.push({ id: it.id, ok: false, motivo: "campo sumiu da página" }); continue; }
      try {
        if (el.tagName === "SELECT"){
          const i = melhorOpcao([...el.options].map(o => o.textContent + "|" + o.value).map(t => t.split("|")[0]), it.valor);
          const j = i >= 0 ? i : melhorOpcao([...el.options].map(o => o.value), it.valor);
          if (j < 0){ res.push({ id: it.id, ok: false, motivo: `não há a opção “${it.valor}”` }); pintar(el, "duvida"); continue; }
          porValor(el, el.options[j].value);
        } else if (el.type === "radio"){
          const grupo = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
          const i = melhorOpcao(grupo.map(r => r.labels?.[0] ? textoSemCampos(r.labels[0]) : so(r.nextSibling?.textContent) || r.value), it.valor);
          if (i < 0){ res.push({ id: it.id, ok: false, motivo: `não há a opção “${it.valor}”` }); continue; }
          grupo[i].click(); pintar(grupo[i].labels?.[0] || grupo[i], it.situacao); res.push({ id: it.id, ok: true }); continue;
        } else {
          let v = it.valor;
          if (el.type === "date") v = paraData(v);
          else if (el.maxLength > 0 && v.length > el.maxLength && /\d/.test(v)) v = v.replace(/\D/g, "");
          porValor(el, v);
        }
        pintar(el, it.situacao);
        res.push({ id: it.id, ok: true });
      } catch (e) { res.push({ id: it.id, ok: false, motivo: String(e.message || e) }); }
    }
    const pri = lista.length && document.querySelector(`[data-yuh="${lista[0].id}"]`);
    if (pri) pri.scrollIntoView({ block: "center", behavior: "smooth" });
    return res;
  }
  function limpar(){ document.querySelectorAll("[data-yuh-estilo]").forEach(despintar); }
  function destacar(id){ const el = document.querySelector(`[data-yuh="${id}"]`); if (!el) return false; el.scrollIntoView({ block: "center", behavior: "smooth" }); el.animate([{ boxShadow: "0 0 0 0 rgba(31,79,209,.9)" }, { boxShadow: "0 0 0 8px rgba(31,79,209,0)" }], { duration: 900, iterations: 2 }); return true; }

  window.__yuh = { varrer, preencher, limpar, destacar };
})();
