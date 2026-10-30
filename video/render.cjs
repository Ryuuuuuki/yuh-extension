// Transforma uma cena HTML em vídeo (ou imagem) para a edição.
//   node render.cjs "cenas/passo.html?n=3&texto=Clique em Carregar sem compactação" saida/passo3.mov
//   node render.cjs "cenas/abertura.html" saida/abertura.mp4
//   node render.cjs "cenas/destaque.html?x=1500&y=120&w=300&h=70&texto=Modo do desenvolvedor" saida/d1.png   (só um quadro, no fim)
// .mov = ProRes 4444 COM transparência (para pôr por cima da gravação de tela)
// .webm = VP9 com transparência · .mp4 = sem transparência (cenas cheias) · .png = um quadro
// Opções: --fps 30 · --segundos N (padrão: window.DURACAO da cena) · --quadro 2.5 (para .png: o instante)
// Precisa de: playwright (Chromium) e ffmpeg.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

const args = process.argv.slice(2);
const opc = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const fps = +opc("fps", 30), segFix = opc("segundos"), quadro = opc("quadro");
const [cena, saida] = args;
if (!cena || !saida){ console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 9).join("\n")); process.exit(1); }

(async () => {
  const [arq, q] = cena.split("?");
  const url = "file://" + path.resolve(__dirname, arq) + (q ? "?" + encodeURI(q).replace(/#/g, "%23") : "");
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(url); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const dur = +(segFix || await p.evaluate(() => window.DURACAO || 4));
  const pos = t => p.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t * 1000; }), t);
  const transp = /\.(mov|webm|png)$/i.test(saida);
  fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true });
  if (/\.png$/i.test(saida)){
    await pos(quadro !== undefined ? +quadro : dur); await p.screenshot({ path: saida, omitBackground: true });
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yuh-quadros-"));
    const n = Math.round(dur * fps);
    for (let i = 0; i < n; i++){ await pos(i / fps); await p.screenshot({ path: path.join(dir, String(i).padStart(5, "0") + ".png"), omitBackground: transp }); }
    const ent = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(dir, "%05d.png")];
    const cod = /\.mov$/i.test(saida) ? ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"]
      : /\.webm$/i.test(saida) ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "4M"]
      : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18"];
    execFileSync("ffmpeg", [...ent, ...cod, saida]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await b.close(); console.log("pronto:", saida, `(${dur}s)`);
})().catch(e => { console.error(e); process.exit(1); });
