// Yuh Extension — transforma as páginas de um PDF em imagens (para o Azure ler).
// Usa o pdf.js 4.10 (o mesmo do Yuh Scanner para Windows), guardado dentro da extensão.
let pdfjs = null;
async function carregar(){
  if (pdfjs) return pdfjs;
  pdfjs = await import("./pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");
  return pdfjs;
}
export const MAX_PAGINAS = 4;

// devolve [{ blob, pagina }] — no máximo MAX_PAGINAS (documento de identidade tem 1 ou 2)
export async function paginasDoPdf(arquivo, limite = MAX_PAGINAS){
  const lib = await carregar();
  const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false }).promise;
  const fotos = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, limite); n++){
      const pg = await doc.getPage(n);
      const v1 = pg.getViewport({ scale: 1 });
      const escala = Math.min(4, 2200 / Math.max(v1.width, v1.height));
      const vp = pg.getViewport({ scale: escala });
      const c = new OffscreenCanvas(Math.round(vp.width), Math.round(vp.height));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      fotos.push({ blob: await c.convertToBlob({ type: "image/jpeg", quality: 0.9 }), pagina: n });
      pg.cleanup();
    }
  } finally { doc.destroy(); }
  return { fotos, total: doc.numPages };
}
