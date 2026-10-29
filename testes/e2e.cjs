// Teste de ponta a ponta da Yuh Extension (Chromium com a extensão carregada).
// Azure e Gemini são simulados com dados FALSOS. Rodar: node testes/e2e.cjs
const { chromium } = require("playwright");
const path = require("path"), http = require("http"), fs = require("fs");
const EXT = path.resolve(__dirname, ".."), SITES = path.join(__dirname, "sites");
const srv = http.createServer((q, r) => { const f = path.join(SITES, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(fs.readFileSync(f)); }).listen(8792);
const L = (text, x, y, w = 300, h = 20, conf = 0.98) => ({ text, boundingPolygon: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], words: text.split(" ").map(t => ({ text: t, confidence: conf })) });
const FRENTE = [L("REPÚBLICA FEDERATIVA DO BRASIL", 300, 20), L("Estado da Bahia", 300, 50), L("Secretaria da Segurança Pública", 300, 80),
  L("Nome / Name", 300, 130), L("CARLA MENDES ROCHA", 300, 155), L("Nome Social / Social Name", 300, 190),
  L("Registro Geral - CPF / Personal Number", 300, 230), L(".Sexo / Sex", 700, 226), L("F", 700, 246, 20), L("529.982.247-25", 300, 257),
  L("Data de Nascimento / Date of Birth", 300, 290), L("Nacionalidade / Nationality", 700, 289), L("BRA", 700, 309, 60), L("21/06/2011", 300, 318),
  L("Naturalidade / Place of Birth", 300, 350), L("Validade / Expiry", 700, 351), L("SALVADOR, BA", 300, 375), L("05/12/2034", 700, 376), L("CARTEIRA DE IDENTIDADE", 300, 500)];
const VERSO = [L("Filiação / Filiation", 50, 40), L("JOANA PEREIRA ROCHA", 50, 65), L("MARCOS MENDES ROCHA", 50, 90),
  L("Órgão Expedidor / Card Issuer", 50, 130), L("SSP/BA", 50, 155), L("Local / Place of Issue", 50, 200), L("Emissão / Issue", 500, 200), L("SALVADOR/BA", 50, 225), L("05/12/2024", 500, 226)];

const falhas = []; const confere = (nome, ok, extra = "") => { console.log((ok ? "  ok  " : "  FALHOU ") + nome + (extra ? " — " + extra : "")); if (!ok) falhas.push(nome); };

(async () => {
  const ctx = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  const id = sw.url().split("/")[2];
  let azure = 0, gemini = 0;
  await ctx.route("https://yuh-teste.cognitiveservices.azure.com/**", r => { const lines = azure++ % 2 ? VERSO : FRENTE; r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ readResult: { blocks: [{ lines }] } }) }); });
  await ctx.route("https://generativelanguage.googleapis.com/**", r => {
    gemini++;
    const pedido = JSON.parse(r.request().postData()).contents[0].parts[0].text;
    if (/CARLA|ROCHA|529\.982/.test(pedido)) falhas.push("DADO DE CLIENTE FOI PARA A IA");
    const campos = JSON.parse(pedido.slice(pedido.indexOf("[", pedido.lastIndexOf("Campos"))).trim());
    const m = {}; for (const c of campos){ const t = (c.rotulo || "").toLowerCase(); m[c.id] = /denomina/.test(t) ? "nome" : /cadastro de pessoas/.test(t) ? "cpf" : /materno/.test(t) ? "mae" : /paterno/.test(t) ? "pai" : /apresentado/.test(t) ? "=Carteira de Identidade" : /expedido por/.test(t) ? "{orgao}/{orgaoUf}" : "-"; }
    r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(m) }] } }] }) });
  });

  const painelDe = async (site, url) => {
    const pg = await ctx.newPage(); await pg.goto("http://localhost:8792/" + url); 
    const ext = await ctx.newPage(); await ext.goto(`chrome-extension://${id}/painel.html`);
    const tabId = await ext.evaluate(async u => (await chrome.tabs.query({ url: u + "*" }))[0].id, "http://localhost:8792/" + url);
    await ext.goto(`chrome-extension://${id}/painel.html?aba=${tabId}`);
    return { pg, ext };
  };

  // ---------- configurar e ler o documento ----------
  let { pg, ext } = await painelDe("portal", "portal.html");
  const erros = []; ext.on("pageerror", e => erros.push(e.message)); ext.on("console", m => m.type() === "error" && erros.push(m.text()));
  await ext.click("#bConfig");
  await ext.fill("#cPonto", "https://yuh-teste.cognitiveservices.azure.com/"); await ext.fill("#cChave", "a".repeat(32)); await ext.click("#cSalvar");
  await ext.click("#vv");
  await ext.setInputFiles("#arq", [path.join(__dirname, "foto.jpg"), path.join(__dirname, "foto.jpg")]);
  await ext.waitForSelector(".campos", { timeout: 20000 });
  const ficha = await ext.$$eval(".campo", cs => Object.fromEntries(cs.filter(c => !c.closest("[hidden]")).map(c => [c.dataset.k, c.querySelector("input").value + (c.classList.contains("duvida") ? " (?)" : "")])));
  console.log("ficha:", JSON.stringify(ficha));
  confere("ficha: nome", ficha.nome === "CARLA MENDES ROCHA");
  confere("ficha: mãe/pai pelo nome", /JOANA/.test(ficha.mae) && /MARCOS/.test(ficha.pai));
  confere("ficha: naturalidade separada", ficha.naturalidade === "SALVADOR" && ficha.natUf === "BA");
  confere("ficha: órgão separado", ficha.orgao === "SSP" && ficha.orgaoUf === "BA");
  confere("ficha: RG = CPF na CIN", ficha.rg === "52998224725");

  // ---------- portal ----------
  const preencherEm = async (e) => { await e.click("#bPreencher"); await e.waitForSelector(".resultado", { timeout: 20000 }); return e.textContent(".resultado"); };
  console.log("\n[portal]", (await preencherEm(ext)).replace(/\s+/g, " ").slice(0, 160));
  let v = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("input,select")].map(e => [e.name, e.value])));
  console.log(JSON.stringify(v));
  confere("portal: nome", v.txtNomeRequerente === "CARLA MENDES ROCHA");
  confere("portal: datas", v.dtNasc === "21/06/2011" && v.dtExp === "05/12/2024");
  confere("portal: selects (sexo, UFs, tipo)", v.sexo === "Feminino" && v.ufNat === "BA" && v.ufDoc === "BA" && v.tipoDoc === "RG");
  confere("portal: número e órgão", v.numDoc === "52998224725" && v.orgao === "SSP");
  confere("portal: e-mail/telefone intocados", v.email === "" && v.fone === "");
  confere("portal: cores", await pg.evaluate(() => document.querySelector("[name=txtNomeRequerente]").style.outlineColor !== ""));
  confere("portal: não enviou", !(await pg.evaluate(() => window.enviado)));
  await pg.screenshot({ path: path.join(__dirname, "tela-portal.png"), fullPage: true });
  await ext.setViewportSize({ width: 380, height: 900 }); await ext.screenshot({ path: path.join(__dirname, "tela-painel.png"), fullPage: true });

  // ---------- tabela antiga ----------
  const docId = await ext.evaluate(async () => (await chrome.storage.local.get("docs")).docs[0].id);
  ({ pg, ext } = await painelDe("tabela", "tabela.html"));
  await ext.click(".doc"); await ext.waitForSelector("#bPreencher");
  console.log("\n[tabela]", (await preencherEm(ext)).replace(/\s+/g, " ").slice(0, 200));
  v = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("input:not([type=radio]),select")].map(e => [e.name, e.value]).concat([["sexo", document.querySelector("[name=campo06]:checked")?.value]])));
  console.log(JSON.stringify(v));
  confere("tabela: nome/cpf só números/data ISO", v.campo01 === "CARLA MENDES ROCHA" && v.campo02 === "52998224725" && v.campo03 === "2011-06-21");
  confere("tabela: mãe/pai", v.campo04 === "JOANA PEREIRA ROCHA" && v.campo05 === "MARCOS MENDES ROCHA");
  confere("tabela: rádio sexo = Fem.", v.sexo === "2");
  confere("tabela: natural + Estado (nome por extenso)", v.campo07 === "SALVADOR" && v.campo08 === "5");
  confere("tabela: doc e Órgão/UF juntos", v.campo09 === "52998224725" && v.campo10 === "SSP/BA");
  confere("tabela: profissão intocada", v.campo11 === "");

  // ---------- moderno (React + iframe) ----------
  ({ pg, ext } = await painelDe("moderno", "moderno.html"));
  await ext.click(".doc"); await ext.waitForSelector("#bPreencher");
  console.log("\n[moderno]", (await preencherEm(ext)).replace(/\s+/g, " ").slice(0, 200));
  const estado = JSON.parse(await pg.textContent("#estado"));
  console.log(JSON.stringify(estado));
  confere("moderno: estado do React recebeu", estado.nomeCompleto === "CARLA MENDES ROCHA" && estado.cpfTitular === "529.982.247-25" && estado.genitora === "JOANA PEREIRA ROCHA" && estado.sexoSel === "F" && estado.municipio === "SALVADOR");
  const q = pg.frameLocator("#quadro");
  const qv = [await q.locator("#rgq").inputValue(), await q.locator("#org").inputValue(), await q.locator("#dte").inputValue()];
  console.log("iframe:", qv);
  confere("moderno: dentro do iframe", qv[0] === "52998224725" && qv[1] === "SSP" && qv[2] === "2024-12-05");

  // ---------- imitação do VizWise: janela por cima de outra tela, quadros dentro de quadros ----------
  ({ pg, ext } = await painelDe("vizwise", "vizwise.html"));
  await pg.waitForTimeout(500);
  await ext.click(".doc"); await ext.waitForSelector("#bPreencher");
  console.log("\n[vizwise]", (await preencherEm(ext)).replace(/\s+/g, " ").slice(0, 220));
  const fr = n => pg.frames().find(f => f.url().endsWith(n));
  v = await fr("viz-firma.html").evaluate(() => Object.fromEntries([...document.querySelectorAll("input,select")].map(e => [e.id, e.value])));
  const bal = await fr("viz-balcao.html").evaluate(() => [...document.querySelectorAll("input")].map(e => e.value).join(""));
  console.log(JSON.stringify(v), "balcão:", JSON.stringify(bal));
  confere("vizwise: Tipo CPF e CPF\\CNPJ", v.tp === "CPF" && v.doc === "529.982.247-25");
  confere("vizwise: sexo com rótulo depois da caixa", v.sx === "F");
  confere("vizwise: UF Exped.", v.ufe === "BA" && v.oe === "SSP" && v.rg === "52998224725");
  confere("vizwise: filiação 1 e 2 na ordem do documento", v.f1 === "JOANA PEREIRA ROCHA" && v.f2 === "MARCOS MENDES ROCHA");
  confere("vizwise: validade do passaporte, e-mail e profissão em branco", v.vp === "" && v.em === "" && v.pr === "");
  confere("vizwise: tela de fundo (Balcão) intocada", bal === "");

  // ---------- estranho: sem IA, depois com IA, depois memória ----------
  ({ pg, ext } = await painelDe("estranho", "estranho.html"));
  await ext.click(".doc"); await ext.waitForSelector("#bPreencher");
  let txt = (await preencherEm(ext)).replace(/\s+/g, " ");
  console.log("\n[estranho sem IA]", txt.slice(0, 220));
  confere("estranho sem IA: avisa que não entendeu", /não entendi/.test(txt));
  await ext.evaluate(async () => { const { config } = await chrome.storage.local.get("config"); await chrome.storage.local.set({ config: { ...config, geminiChave: "AIza" + "x".repeat(30) } }); });
  await ext.click("#bPreencher"); await ext.waitForFunction(() => document.querySelector(".resultado") && !document.querySelector("#lendoIA") && !/Preenchendo|Entendendo/.test(document.querySelector("#bPreencher").textContent), null, { timeout: 20000 });
  txt = (await ext.textContent(".resultado")).replace(/\s+/g, " ");
  console.log("[estranho com IA]", txt.slice(0, 200));
  v = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("input,select")].map(e => [e.name, e.value])));
  console.log(JSON.stringify(v), "chamadas Gemini:", gemini);
  confere("IA monta valor: texto fixo e junção", v.f_h === "Carteira de Identidade" && v.f_i === "SSP/BA");
  confere("estranho: IA mapeou", v.f_a === "CARLA MENDES ROCHA" && v.f_b === "529.982.247-25" && v.f_c === "JOANA PEREIRA ROCHA" && v.f_d === "MARCOS MENDES ROCHA");
  confere("estranho: telefone e cônjuge intocados", v.f_e === "" && v.f_g === "");
  confere("estranho: campos da IA em amarelo", /para conferir/.test(txt));
  // ensinar: trocar o que vai em "Ascendente paterno" para "Não preencher"
  const linha = ext.locator(".lig", { hasText: "Ascendente paterno" });
  await linha.locator("select").selectOption("-");
  const mapas = await ext.evaluate(async () => (await chrome.storage.local.get("mapas")).mapas);
  confere("ensinar: guardou no mapa do site", JSON.stringify(mapas).includes('"-"'));
  // memória: recarrega o site e preenche de novo sem chamar a IA
  const antes = gemini;
  await pg.reload(); await pg.waitForLoadState("load");
  await ext.evaluate(() => document.querySelectorAll(".resultado").forEach(x => x.remove()));
  await ext.click("#bPreencher"); await ext.waitForSelector(".resultado", { timeout: 20000 });
  v = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("input")].map(e => [e.name, e.value])));
  confere("memória: não chamou a IA de novo", gemini === antes, `chamadas ${antes}→${gemini}`);
  console.log("depois do reload:", JSON.stringify(v));
  confere("memória: lembrou o que foi ensinado", v.f_a === "CARLA MENDES ROCHA" && v.f_d === "");
  confere("nenhum site foi enviado", !(await pg.evaluate(() => window.enviado)));
  confere("sem erros no painel", erros.length === 0, erros.join(" | "));
  console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join("; ")}` : "\nTUDO CERTO");
  await ctx.close(); srv.close(); process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
