// Yuh Extension — serviço de fundo: abre o painel lateral quando clicam no ícone e, quando o
// Yuh Scanner do Windows troca os arquivos da pasta (versão nova), recarrega a extensão sozinho.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function versaoNoDisco(){
  try { return (await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json()).version; }
  catch { return null; }
}
async function conferirVersao(){
  const v = await versaoNoDisco();
  if (v && v !== chrome.runtime.getManifest().version) chrome.runtime.reload();
}
chrome.alarms.create("yuh-versao", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === "yuh-versao") conferirVersao(); });
chrome.runtime.onMessage.addListener(m => { if (m === "yuh-conferir-versao") conferirVersao(); });
