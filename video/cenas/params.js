// Lê parâmetros da URL (?titulo=…&n=…) e preenche [data-p="nome"]. Também expõe a duração da cena.
(function(){
  const q = new URLSearchParams(location.search);
  document.querySelectorAll("[data-p]").forEach(el => { const v = q.get(el.dataset.p); if (v !== null) el.textContent = v; });
  window.P = k => q.get(k);
})();
