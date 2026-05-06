/**
 * Versão local (brinde / venda): sem Google Drive.
 * Dados em IndexedDB neste aparelho, com fallback em localStorage.
 */

const flow = [
  "entrada",
  "diagnostico",
  "orcamento",
  "em_andamento",
  "pronto",
  "entregue"
];

const FORMAS_PAGAMENTO = ["Pix", "Dinheiro", "Cartão", "Transferência", "Outro"];

const SERVICOS_PADRAO = [
  { nome: "Troca e ajuste rastilho", preco: 80 },
  { nome: "Troca de pestana (nut)", preco: 80 },
  { nome: "Limpeza e Hidratação da escala", preco: 80 },
  { nome: "Polimento e Nivelamento de trastes", preco: 150 },
  { nome: "Colagem e regulagem de cavalete", preco: 120 },
  { nome: "Ajuste Ação das cordas e oitavas", preco: 120 },
  { nome: "Troca de cordas", preco: 40 },
  { nome: "Ajuste de tensor", preco: 60 },
  { nome: "Colagem de trinca", preco: 100 },
  { nome: "Colagem Braço/Headstock", preco: 200 },
  { nome: "Regulagem geral", preco: 150 },
  { nome: "Limpeza geral", preco: 50 },
  {
    nome: "Manutenção - Pacote Básico",
    preco: 120,
    desc: "Troca de cordas • Regulagem básica • Limpeza geral"
  },
  {
    nome: "Manutenção - Pacote Completo",
    preco: 220,
    desc: "Setup completo • Hidratação • Polimento leve • Troca de cordas"
  },
  {
    nome: "Manutenção - Pacote Premium",
    preco: 320,
    desc: "Setup avançado • Nivelamento trastes • Ajuste rastilho • Correções leves"
  },
];

const IDB_NAME = "luthier-os-local-v1";
const IDB_STORE = "kv";
const IDB_KEY_SERVICOS = "servicos";
const IDB_KEY_CATALOGO = "catalogo";
const LS_FALLBACK = "luthier-os-servicos-v1";
const LS_CATALOGO_KEY = "luthier-catalogo-local-v1";
const LS_LAST_BACKUP_EXPORT_AT = "luthier-last-backup-export-at-v1";
const LS_LAST_BACKUP_TOAST_AT = "luthier-last-backup-toast-at-v1";
const IDB_VER = 1;

const STORAGE_HINT_AUTO_HIDE_MS = 22000;
const BACKUP_TOAST_MIN_INTERVAL_MS = 1000 * 60 * 60 * 24 * 2;
const BACKUP_CONSIDER_STALE_MS = 1000 * 60 * 60 * 24 * 3;
const BACKUP_TOAST_AFTER_LOAD_MS = STORAGE_HINT_AUTO_HIDE_MS + 4000;

let storageHintUserDismissed = false;
let storageHintHideTimer = null;
let backupToastAfterLoadTimer = null;

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("indexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const g = tx.objectStore(IDB_STORE).get(key);
    g.onerror = () => reject(g.error);
    g.onsuccess = () => resolve(g.result);
  });
}

async function idbPut(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(IDB_STORE).put(val, key);
  });
}

function lsRead() {
  try {
    const t = localStorage.getItem(LS_FALLBACK);
    if (!t) return null;
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function lsWrite(payload) {
  localStorage.setItem(LS_FALLBACK, JSON.stringify(payload));
}

let catalogoAtual = [];

function catalogoPadrao() {
  return SERVICOS_PADRAO.map(s => ({
    nome: s.nome,
    preco: Number(s.preco) || 0,
    ...(s.desc ? { desc: s.desc } : {})
  }));
}

function normalizarCatalogo(arr) {
  const out = (Array.isArray(arr) ? arr : [])
    .map(item => ({
      nome: String(item?.nome ?? "").trim(),
      preco: Math.max(0, Number(item?.preco) || 0),
      ...((item?.desc && String(item.desc).trim()) ? { desc: String(item.desc).trim() } : {})
    }))
    .filter(x => x.nome);
  return out.length ? out : catalogoPadrao();
}

async function loadCatalogoInMemory() {
  try {
    const c = await idbGet(IDB_KEY_CATALOGO);
    if (Array.isArray(c) && c.length) {
      catalogoAtual = normalizarCatalogo(c);
      return;
    }
  } catch {}
  try {
    const t = localStorage.getItem(LS_CATALOGO_KEY);
    if (t) {
      const c = JSON.parse(t);
      if (Array.isArray(c) && c.length) {
        catalogoAtual = normalizarCatalogo(c);
        return;
      }
    }
  } catch {}
  catalogoAtual = catalogoPadrao();
}

async function saveCatalogo() {
  try {
    await idbPut(IDB_KEY_CATALOGO, catalogoAtual);
  } catch {
    localStorage.setItem(LS_CATALOGO_KEY, JSON.stringify(catalogoAtual));
  }
}

function lerTimestampLs(key) {
  try {
    const t = localStorage.getItem(key);
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function marcarBackupExportado() {
  try {
    const now = String(Date.now());
    localStorage.setItem(LS_LAST_BACKUP_EXPORT_AT, now);
    localStorage.setItem(LS_LAST_BACKUP_TOAST_AT, now);
  } catch {}
}

function tentarToastLembreteBackup() {
  const now = Date.now();
  const lastExport = lerTimestampLs(LS_LAST_BACKUP_EXPORT_AT);
  const lastToast = lerTimestampLs(LS_LAST_BACKUP_TOAST_AT);
  const semExportOuAntigo = !lastExport || (now - lastExport > BACKUP_CONSIDER_STALE_MS);
  const respeitaIntervalo = !lastToast || (now - lastToast > BACKUP_TOAST_MIN_INTERVAL_MS);
  if (!semExportOuAntigo || !respeitaIntervalo) return;
  try {
    localStorage.setItem(LS_LAST_BACKUP_TOAST_AT, String(now));
  } catch {}
  showToast("Lembrete: faça backup JSON de vez em quando — os dados ficam só neste aparelho.");
}

function agendarLembreteBackupAposCarregar() {
  clearTimeout(backupToastAfterLoadTimer);
  backupToastAfterLoadTimer = setTimeout(() => tentarToastLembreteBackup(), BACKUP_TOAST_AFTER_LOAD_MS);
}

function atualizarIndicadorArmazenamento() {
  const el = document.getElementById("storage-hint");
  if (!el) return;
  const n = servicos.length;
  el.textContent = n === 0
    ? "Dados só neste aparelho. Use backup JSON antes de trocar de celular ou limpar o navegador."
    : `${n} OS salvas neste aparelho · faça backup com frequência.`;

  if (storageHintUserDismissed) return;

  el.classList.remove("is-dismissed");
  el.setAttribute("aria-hidden", "false");
  clearTimeout(storageHintHideTimer);
  storageHintHideTimer = setTimeout(() => {
    el.classList.add("is-dismissed");
    el.setAttribute("aria-hidden", "true");
    storageHintUserDismissed = true;
  }, STORAGE_HINT_AUTO_HIDE_MS);
}

let editingId = null;
let servicos = [];
let currentStatusIndex = 0;
let valorManual = false;
let filtroBusca = "";
let fotosFormState = { antes: "", depois: "" };

const formContainer = document.getElementById("form-container");

function escapeHtml(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizarFotosServico(s) {
  const f = s?.fotos;
  if (!f || typeof f !== "object") {
    s.fotos = { antes: "", depois: "" };
    return;
  }
  s.fotos = {
    antes: typeof f.antes === "string" ? f.antes : "",
    depois: typeof f.depois === "string" ? f.depois : ""
  };
}

function atualizarPreviewFoto(tipo) {
  const isAntes = tipo === "antes";
  const preview = document.getElementById(isAntes ? "fotoAntesPreview" : "fotoDepoisPreview");
  const remover = document.getElementById(isAntes ? "fotoAntesRemover" : "fotoDepoisRemover");
  const valor = fotosFormState[tipo] || "";
  if (!preview || !remover) return;
  if (!valor) {
    preview.hidden = true;
    preview.removeAttribute("src");
    remover.hidden = true;
    return;
  }
  preview.src = valor;
  preview.hidden = false;
  remover.hidden = false;
}

function atualizarPreviewsFotosForm() {
  atualizarPreviewFoto("antes");
  atualizarPreviewFoto("depois");
}

function resetFotosForm() {
  fotosFormState = { antes: "", depois: "" };
  const inputAntes = document.getElementById("fotoAntesInput");
  const inputDepois = document.getElementById("fotoDepoisInput");
  if (inputAntes) inputAntes.value = "";
  if (inputDepois) inputDepois.value = "";
  atualizarPreviewsFotosForm();
}

function carregarFotosNoForm(fotos) {
  fotosFormState = {
    antes: fotos?.antes || "",
    depois: fotos?.depois || ""
  };
  atualizarPreviewsFotosForm();
}

async function processarFotoArquivo(file) {
  if (!file) return "";
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Arquivo não é imagem");
  }
  const bitmap = await createImageBitmap(file);
  const maxLado = 1600;
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function parseValorReais(raw) {
  if (raw == null) return NaN;
  let str = String(raw).trim().replace(/\s/g, "").replace(/R\$\s?/gi, "");
  if (!str) return NaN;
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");
  if (hasComma && hasDot) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    str = str.replace(",", ".");
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
}

function uid() {
  return "OS-" + Date.now().toString().slice(-5);
}

function isMobile() {
  return window.innerWidth < 768;
}

function abrirForm() {
  formContainer.classList.add("is-open");
  formContainer.setAttribute("aria-hidden", "false");
}

function fecharForm() {
  formContainer.classList.remove("is-open");
  formContainer.setAttribute("aria-hidden", "true");
}

function mudarStatusDirecao(direcao) {
  currentStatusIndex += direcao;
  if (currentStatusIndex < 0) currentStatusIndex = 0;
  if (currentStatusIndex >= flow.length) currentStatusIndex = flow.length - 1;
  syncFiltroSelectFromIndex();
  render();
}

function syncFiltroSelectFromIndex() {
  const sel = document.getElementById("filtroStatus");
  if (!sel) return;
  const v = flow[currentStatusIndex];
  if (v && sel.value !== v) sel.value = v;
}

function matchesBusca(s) {
  const q = filtroBusca.trim().toLowerCase();
  if (!q) return true;
  const parts = [
    s.id,
    s.cliente,
    s.instrumento,
    s.problema,
    s.notasInternas,
    s.endereco,
    s.telefone,
    ...(Array.isArray(s.servicos) ? s.servicos : [])
  ].filter(Boolean).join(" ").toLowerCase();
  return parts.includes(q);
}

function scrollKanbanParaStatus(status) {
  if (isMobile()) return;
  const ix = flow.indexOf(status);
  if (ix < 0) return;
  const kanban = document.getElementById("kanban");
  const colunas = kanban?.querySelectorAll(".coluna");
  colunas?.[ix]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

/* ========== modal ========== */
function fecharModal() {
  const root = document.getElementById("modal-root");
  root.classList.remove("is-open");
  root.setAttribute("aria-hidden", "true");
  document.getElementById("modal-body").innerHTML = "";
  document.getElementById("modal-footer").innerHTML = "";
}

function abrirModal({ title, bodyHTML, footerButtons }) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHTML;
  const foot = document.getElementById("modal-footer");
  foot.innerHTML = "";
  (footerButtons || []).forEach(b => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = b.label;
    btn.className = b.danger ? "btn-modal-danger" : b.primary ? "btn-modal-primary" : "btn-modal-secondary";
    btn.addEventListener("click", async () => {
      await b.onClick();
    });
    foot.appendChild(btn);
  });
  const root = document.getElementById("modal-root");
  root.classList.add("is-open");
  root.setAttribute("aria-hidden", "false");
  const first = document.getElementById("modal-body").querySelector("input, select, textarea");
  first?.focus();
}

function fmtBRL(n) {
  const x = Math.round(Number(n) * 100) / 100;
  return x.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function modalPagamentoCampos(prefill = {}) {
  const forma = prefill.forma || "Pix";
  const opts = FORMAS_PAGAMENTO.map(f =>
    `<option value="${escapeAttr(f)}"${f === forma ? " selected" : ""}>${escapeHtml(f)}</option>`
  ).join("");
  const valorStr = prefill.valorStr != null ? escapeAttr(prefill.valorStr) : "";
  const obsBody = prefill.obs ? escapeHtml(prefill.obs) : "";
  return `
    <div class="modal-field">
      <label for="mp-valor">Valor (R$)</label>
      <input type="text" id="mp-valor" inputmode="decimal" autocomplete="off" placeholder="Ex.: 150 ou 150,50" value="${valorStr}">
      <p class="modal-hint">Vírgula ou ponto são aceitos.</p>
    </div>
    <div class="modal-field">
      <label for="mp-forma">Forma de pagamento</label>
      <select id="mp-forma">${opts}</select>
    </div>
    <div class="modal-field">
      <label for="mp-obs">Observação <span class="hint">(opcional)</span></label>
      <textarea id="mp-obs" placeholder="Últimos 4 dígitos, comprovante, etc.">${obsBody}</textarea>
    </div>
  `;
}

function lerCamposModalPagamento() {
  const raw = document.getElementById("mp-valor")?.value;
  const valor = parseValorReais(raw);
  const forma = document.getElementById("mp-forma")?.value || "Pix";
  const obs = (document.getElementById("mp-obs")?.value || "").trim();
  return { valor, forma, obs };
}

function htmlCatalogRow(s) {
  return `
    <div class="catalog-row">
      <div class="modal-field">
        <label>Nome do serviço</label>
        <input type="text" class="cat-nome" value="${escapeAttr(s.nome)}" placeholder="Ex.: Troca de cordas" autocomplete="off">
      </div>
      <div class="modal-field catalog-row-tools">
        <div class="catalog-preco-wrap">
          <label>Preço (R$)</label>
          <input type="number" class="cat-preco" min="0" step="1" value="${escapeAttr(String(s.preco ?? 0))}">
        </div>
        <button type="button" class="btn-cat-remove">Remover</button>
      </div>
      <div class="modal-field">
        <label>Descrição na tabela <span class="hint">(opcional)</span></label>
        <input type="text" class="cat-desc" value="${escapeAttr(s.desc || "")}" placeholder="Subtítulo na checklist" autocomplete="off">
      </div>
    </div>`;
}

function lerCatalogoDoModal() {
  const root = document.getElementById("catalog-rows");
  if (!root) return [];
  const out = [];
  root.querySelectorAll(".catalog-row").forEach(row => {
    const nome = (row.querySelector(".cat-nome")?.value || "").trim();
    const preco = Number(row.querySelector(".cat-preco")?.value) || 0;
    const desc = (row.querySelector(".cat-desc")?.value || "").trim();
    if (!nome) return;
    out.push({ nome, preco, ...(desc ? { desc } : {}) });
  });
  return out;
}

function onCatalogRowRemoveClick(e) {
  const btn = e.target.closest(".btn-cat-remove");
  if (!btn || !document.getElementById("catalog-rows")?.contains(btn)) return;
  const wrap = document.getElementById("catalog-rows");
  if (wrap.querySelectorAll(".catalog-row").length <= 1) {
    showToast("Mantenha pelo menos um serviço na tabela");
    return;
  }
  const row = btn.closest(".catalog-row");
  const prev = row?.previousElementSibling;
  if (prev?.tagName === "HR" && prev.classList.contains("catalog-sep")) prev.remove();
  row?.remove();
}

function abrirEditorCatalogo() {
  const rowsHtml = catalogoAtual.map(s => htmlCatalogRow(s)).join('<hr class="catalog-sep">');
  abrirModal({
    title: "Tabela de serviços e preços",
    bodyHTML: `
      <p class="modal-hint">Edite valores, inclua linhas ou remova serviços que você não usa. Isso afeta a checklist e o cálculo automático do orçamento. OS já salvas continuam com os nomes gravados na época.</p>
      <div id="catalog-rows">${rowsHtml}</div>
      <button type="button" class="btn-modal-secondary catalog-add-btn" id="catalog-add" style="width:100%;margin-top:10px">＋ Incluir serviço</button>`,
    footerButtons: [
      { label: "Fechar", onClick: () => fecharModal() },
      {
        label: "Restaurar padrão",
        onClick: async () => {
          if (!confirm("Substituir toda a tabela pelos valores iniciais do aplicativo?")) return;
          catalogoAtual = catalogoPadrao();
          await saveCatalogo();
          fecharModal();
          renderChecklist();
          showToast("Tabela padrão restaurada");
        }
      },
      {
        label: "Salvar tabela",
        primary: true,
        onClick: async () => {
          const novo = lerCatalogoDoModal();
          if (!novo.length) {
            showToast("Inclua ao menos um serviço com nome");
            return;
          }
          const chaves = novo.map(x => x.nome.toLowerCase());
          if (new Set(chaves).size !== chaves.length) {
            showToast("Há dois serviços com o mesmo nome — ajuste antes de salvar");
            return;
          }
          catalogoAtual = novo;
          await saveCatalogo();
          fecharModal();
          renderChecklist();
          showToast("Tabela salva");
        }
      }
    ]
  });
  document.getElementById("catalog-add").onclick = () => {
    document.getElementById("catalog-rows").insertAdjacentHTML(
      "beforeend",
      '<hr class="catalog-sep">' + htmlCatalogRow({ nome: "", preco: 0, desc: "" })
    );
  };
}

/* ========== toast ========== */
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

/* ========== checklist ========== */
function renderChecklist() {
  const container = document.getElementById("checklist-servicos");
  const linhas = catalogoAtual.map(s => `
  <label class="check-item">
    <span class="check-main">
      <input type="checkbox" value="${escapeAttr(s.nome)}" class="check-input">
      <span class="check-box" aria-hidden="true"></span>
      <span class="check-nome-wrap">
        <span class="check-nome" title="${escapeAttr(s.desc || "")}">${escapeHtml(s.nome)}</span>
        ${s.desc ? `<span class="check-desc">${escapeHtml(s.desc)}</span>` : ""}
      </span>
    </span>
    <span class="check-preco">R$ ${escapeHtml(String(s.preco))}</span>
  </label>
`).join("");

  container.innerHTML = `
    <div class="checklist-table" role="group" aria-label="Tabela de serviços e preços">
      <div class="checklist-head">
        <span class="checklist-h-serv">Serviço</span>
        <span class="checklist-h-preco">Preço</span>
      </div>
      <div class="checklist-body">
        ${linhas}
      </div>
    </div>
  `;

  container.querySelectorAll("input.check-input").forEach(input => {
    input.addEventListener("change", calcularTotalChecklist);
  });
}

function calcularTotalChecklist() {
  if (valorManual) return;
  const campo = document.getElementById("orcamento");
  const checks = document.querySelectorAll("#checklist-servicos input:checked");
  let total = 0;
  checks.forEach(c => {
    const serv = catalogoAtual.find(x => x.nome === c.value);
    if (serv) total += serv.preco;
  });
  const extra = Number(document.getElementById("extraValor").value) || 0;
  const desconto = Number(document.getElementById("desconto").value) || 0;
  total = total + extra - desconto;
  campo.value = total > 0 ? total : 0;
}

function preencherChecklistSelecionado(lista) {
  document.querySelectorAll("#checklist-servicos input").forEach(input => {
    input.checked = lista?.includes(input.value) || false;
  });
}

document.getElementById("orcamento").addEventListener("input", e => {
  if (e.isTrusted) valorManual = true;
});

document.getElementById("extraValor").addEventListener("input", calcularTotalChecklist);
document.getElementById("desconto").addEventListener("input", calcularTotalChecklist);

function garantirArrayPagamentos(s) {
  let p = s.pagamentos;
  if (p == null || p === "") {
    s.pagamentos = [];
    return;
  }
  if (typeof p === "string") {
    const t = p.trim();
    if (!t) {
      s.pagamentos = [];
      return;
    }
    try {
      const parsed = JSON.parse(t);
      s.pagamentos = Array.isArray(parsed) ? parsed : [];
    } catch {
      s.pagamentos = [];
    }
    return;
  }
  if (!Array.isArray(p)) {
    s.pagamentos = [];
  }
}

async function load() {
  try {
    let rows = await idbGet(IDB_KEY_SERVICOS);
    if (rows == null) {
      rows = lsRead();
    }
    servicos = Array.isArray(rows) ? rows : [];
  } catch (e) {
    const fallback = lsRead();
    servicos = Array.isArray(fallback) ? fallback : [];
    console.warn("Armazenamento local:", e);
  }
  if (!Array.isArray(servicos)) servicos = [];
  servicos.forEach(garantirArrayPagamentos);
  servicos.forEach(normalizarFotosServico);
  render();
  atualizarIndicadorArmazenamento();
  agendarLembreteBackupAposCarregar();
}

async function save() {
  try {
    await idbPut(IDB_KEY_SERVICOS, servicos);
  } catch (e) {
    try {
      lsWrite(servicos);
    } catch (e2) {
      throw new Error("Não foi possível gravar neste aparelho");
    }
  }
  atualizarIndicadorArmazenamento();
}

function corStatus(status) {
  switch (status) {
    case "entrada": return "#78716c";
    case "diagnostico": return "#d97706";
    case "orcamento": return "#0284c7";
    case "em_andamento": return "#7c3aed";
    case "pronto": return "#16a34a";
    case "entregue": return "#1c1917";
    default: return "#a8a29e";
  }
}

function nextStatus(current) {
  const idx = flow.indexOf(current);
  return flow[idx + 1] || current;
}

async function avancarStatus(id) {
  const idx = servicos.findIndex(s => s.id === id);
  if (idx === -1) return;
  const atual = servicos[idx].status || "entrada";
  servicos[idx].status = nextStatus(atual);
  render();
  try {
    await save();
    showToast("Etapa atualizada");
  } catch (e) {
    showToast("Erro ao salvar");
    await load();
  }
}

function formatarData(dataISO) {
  if (!dataISO) return "";
  const d = new Date(dataISO);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function formatarDataHora(dataISO) {
  if (!dataISO) return "";
  const d = new Date(dataISO);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatarStatus(status) {
  return String(status || "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function renderCard(s, statusColuna = null) {
  garantirArrayPagamentos(s);
  normalizarFotosServico(s);

  const base = (s.orcamento || 0)
    - (Number(s.extraValor) || 0)
    + (Number(s.desconto) || 0);

  const total = Number(s.orcamento) || 0;
  const recebido = s.pagamentos.reduce((soma, p) => soma + (Number(p.valor) || 0), 0);
  const restante = total - recebido;
  const pago = restante <= 0 && total > 0;
  const progresso = total > 0 ? (recebido / total) * 100 : 0;
  const mostrarFinanceiro = total > 0 || recebido > 0;

  const idAttr = escapeAttr(s.id);
  const fotosHtml = (s.fotos.antes || s.fotos.depois) ? `
  <div class="card-fotos">
    ${s.fotos.antes ? `<button type="button" class="foto-chip" data-action="view-photo" data-id="${idAttr}" data-label="Antes" data-src="${escapeAttr(s.fotos.antes)}"><img src="${escapeAttr(s.fotos.antes)}" alt="Foto antes"><span>Antes</span></button>` : ""}
    ${s.fotos.depois ? `<button type="button" class="foto-chip" data-action="view-photo" data-id="${idAttr}" data-label="Depois" data-src="${escapeAttr(s.fotos.depois)}"><img src="${escapeAttr(s.fotos.depois)}" alt="Foto depois"><span>Depois</span></button>` : ""}
  </div>` : "";
  const notasBlock = (s.notasInternas && String(s.notasInternas).trim())
    ? `<details class="card-notas"><summary>Notas da oficina</summary><div class="notas-body">${escapeHtml(s.notasInternas)}</div></details>`
    : "";

  const pagamentosHtml = (s.pagamentos?.length) ? `
  <div class="pagamentos">
    ${s.pagamentos.map((p, i) => {
    const forma = p.forma ? `<span class="pagamento-forma">${escapeHtml(p.forma)}</span>` : "";
    const obs = p.obs ? `<div class="pagamento-obs" title="${escapeAttr(p.obs)}">${escapeHtml(p.obs)}</div>` : "";
    return `
    <div class="pagamento-item">
      <div class="pagamento-meta">
        <div class="pagamento-linha">
          <span class="pagamento-valor">R$ ${escapeHtml(String(p.valor))}</span>
          <span class="data-pagamento">${formatarDataHora(p.data)}</span>
        </div>
        ${forma || obs ? `<div class="pagamento-linha">${forma}${obs}</div>` : ""}
      </div>
      <div class="pagamento-acoes">
        <button type="button" class="btn-editar-pag" data-action="edit-pay" data-id="${idAttr}" data-index="${i}" title="Alterar">✏️</button>
        <button type="button" class="btn-remover" data-action="del-pay" data-id="${idAttr}" data-index="${i}" title="Excluir">✕</button>
      </div>
    </div>`;
  }).join("")}
  </div>` : "";

  return `
    <div class="card" data-card-id="${idAttr}" ${statusColuna ? `style="border-left:4px solid ${corStatus(statusColuna)}"` : ""}>
      <div class="card-os-id">${escapeHtml(s.id)}</div>
      <div class="card-header">
        <div>
          <strong class="cliente">${escapeHtml(s.cliente)}</strong>
          <span class="instrumento">${escapeHtml(s.instrumento || "")}</span>
        </div>
        <div class="data">${formatarData(s.data)}</div>
      </div>
      ${fotosHtml}
      ${notasBlock}
      ${(s.servicos?.length || s.extraNome) ? `
        <div class="card-servicos">
          ${s.servicos?.length ? `
            <div class="servico-bloco">
              <div class="servico-header">
                <span>Serviços</span>
                ${base ? `<span class="servico-valor">R$ ${escapeHtml(String(base))}</span>` : ""}
              </div>
              <div class="servico-tags">
                ${s.servicos.map(serv => `<span class="tag-servico">${escapeHtml(serv)}</span>`).join("")}
              </div>
            </div>` : ""}
          ${s.extraNome ? `
            <div class="extra-bloco">
              <div class="servico-header">
                <span>Extra</span>
                ${s.extraValor ? `<span class="servico-valor">R$ ${escapeHtml(String(s.extraValor))}</span>` : ""}
              </div>
              <span class="tag-servico tag-extra">${escapeHtml(s.extraNome)}</span>
            </div>` : ""}
        </div>` : ""}
      ${mostrarFinanceiro ? `
        <div class="financeiro">
          ${s.desconto ? `<div class="desconto">− Desconto: R$ ${escapeHtml(String(s.desconto))}</div>` : ""}
          <div class="total">Total: ${total > 0 ? `R$ ${total}` : `<span class="sem-orcamento">— defina no lápis</span>`}</div>
          ${pagamentosHtml}
          ${total > 0
        ? (pago
          ? `<div class="pago-ok">✔ Quitado</div>`
          : `<div class="falta">Falta: R$ ${fmtBRL(restante)}</div>`)
        : (recebido > 0 ? `<div class="falta">Adiantamento (sem total na OS): R$ ${fmtBRL(recebido)}</div>` : "")
      }
          <div class="barra"><div class="barra-fill" style="width:${Math.min(100, progresso)}%"></div></div>
        </div>` : ""}
      <div class="card-footer">
        <div class="card-actions">
          <button type="button" class="card-action" data-action="wa" data-id="${idAttr}" title="WhatsApp">📲</button>
          <button type="button" class="card-action" data-action="edit" data-id="${idAttr}" title="Editar OS">✏️</button>
          <button type="button" class="card-action" data-action="next" data-id="${idAttr}" title="Próxima etapa">➡️</button>
          ${(s.status || "entrada") === "entregue"
      ? `<button type="button" class="card-action" data-action="archive" data-id="${idAttr}" title="Arquivar OS">📦</button>`
      : ""}
          <button type="button" class="card-action" data-action="pay" data-id="${idAttr}" title="Registrar recebimento">💵</button>
          <button type="button" class="card-action danger" data-action="delete" data-id="${idAttr}" title="Excluir OS">🗑️</button>
        </div>
      </div>
    </div>`;
}

function renderKanban() {
  const kanban = document.getElementById("kanban");
  kanban.innerHTML = "";

  flow.forEach(statusColuna => {
    const coluna = document.createElement("div");
    coluna.className = "coluna";
    coluna.innerHTML = `<h3>${escapeHtml(formatarStatus(statusColuna))}</h3>`;

    servicos
      .filter(s => !s.arquivado)
      .filter(s => (s.status || "entrada") === statusColuna)
      .filter(matchesBusca)
      .forEach(s => {
        coluna.insertAdjacentHTML("beforeend", renderCard(s, statusColuna));
      });

    kanban.appendChild(coluna);
  });
}

function renderMobile() {
  currentStatusIndex = Math.max(0, Math.min(currentStatusIndex, flow.length - 1));
  syncFiltroSelectFromIndex();

  const kanban = document.getElementById("kanban");
  kanban.innerHTML = "";

  const statusSelecionado = flow[currentStatusIndex];
  const titulo = document.createElement("h2");
  titulo.className = "mobile-col-title";
  titulo.textContent = formatarStatus(statusSelecionado);
  kanban.appendChild(titulo);

  const lista = document.createElement("div");
  servicos
    .filter(s => !s.arquivado)
    .filter(s => (s.status || "entrada") === statusSelecionado)
    .filter(matchesBusca)
    .reverse()
    .forEach(s => {
      lista.insertAdjacentHTML("beforeend", renderCard(s));
    });
  kanban.appendChild(lista);
}

function render() {
  if (isMobile()) {
    renderMobile();
  } else {
    renderKanban();
  }
}

function onKanbanClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const serv = servicos.find(x => x.id === id);
  if (!serv && action !== "voltar") return;

  switch (action) {
    case "wa":
      abrirWhatsApp(serv);
      break;
    case "edit":
      editar(id);
      break;
    case "next":
      avancarStatus(id);
      break;
    case "pay":
      abrirPagamento(id);
      break;
    case "archive":
      confirmarArquivamento(id);
      break;
    case "delete":
      excluirServico(id);
      break;
    case "view-photo":
      abrirVisualizacaoFoto(btn.dataset.src, btn.dataset.label);
      break;
    case "edit-pay": {
      const i = Number(btn.dataset.index);
      editarPagamento(id, i);
      break;
    }
    case "del-pay": {
      const i = Number(btn.dataset.index);
      removerPagamento(id, i);
      break;
    }
    case "unarchive":
      confirmarDesarquivamento(id);
      break;
    default:
      break;
  }
}

function abrirVisualizacaoFoto(src, label = "Foto") {
  if (!src) return;
  abrirModal({
    title: label,
    bodyHTML: `<img src="${escapeAttr(src)}" alt="${escapeAttr(label)}" style="width:100%;height:auto;border-radius:12px;display:block">`,
    footerButtons: [{ label: "Fechar", onClick: () => fecharModal() }]
  });
}

function abrirWhatsApp(s) {
  const url = gerarLinkWhatsApp(s.telefone, s.cliente, s.status || "entrada", s.orcamento);
  if (url !== "#") window.open(url, "_blank");
  else showToast("Telefone invalido na OS");
}

function normalizarNumeroWhatsApp(telefone) {
  const digits = String(telefone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return "";
}

function gerarLinkWhatsApp(telefone, nome, status, valor) {
  if (!telefone) return "#";
  const numero = normalizarNumeroWhatsApp(telefone);
  if (!numero) return "#";
  const v = valor || "0";
  const n = nome || "cliente";
  let mensagem = "";
  switch (status) {
    case "orcamento":
      mensagem = `Olá ${n}, seu orçamento ficou em R$ ${v}. Podemos prosseguir?`;
      break;
    case "pronto":
      mensagem = `Olá ${n}, seu instrumento está pronto. Valor: R$ ${v}`;
      break;
    default:
      mensagem = `Olá ${n}`;
  }
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

function abrirPagamento(id) {
  abrirModal({
    title: "Registrar recebimento",
    bodyHTML: modalPagamentoCampos({}),
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Registrar",
        primary: true,
        onClick: async () => {
          const { valor, forma, obs } = lerCamposModalPagamento();
          if (!Number.isFinite(valor) || valor <= 0) {
            showToast("Valor inválido");
            return;
          }
          const idx = servicos.findIndex(s => s.id === id);
          if (idx === -1) return;
          garantirArrayPagamentos(servicos[idx]);
          servicos[idx].pagamentos.push({
            valor,
            data: new Date().toISOString(),
            forma,
            ...(obs ? { obs } : {})
          });
          fecharModal();
          render();
          try {
            await save();
            showToast("Recebimento salvo");
          } catch (err) {
            showToast("Erro ao salvar");
            await load();
          }
        }
      }
    ]
  });
}

function editarPagamento(servicoId, indexPagamento) {
  const idx = servicos.findIndex(s => s.id === servicoId);
  if (idx === -1) return;
  garantirArrayPagamentos(servicos[idx]);
  const atual = servicos[idx].pagamentos[indexPagamento];
  if (!atual) return;

  abrirModal({
    title: "Editar recebimento",
    bodyHTML: modalPagamentoCampos({
      valorStr: String(atual.valor),
      forma: atual.forma || "Pix",
      obs: atual.obs || ""
    }),
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Salvar",
        primary: true,
        onClick: async () => {
          const { valor, forma, obs } = lerCamposModalPagamento();
          if (!Number.isFinite(valor) || valor <= 0) {
            showToast("Valor inválido");
            return;
          }
          const atualizado = { ...atual, valor, forma };
          if (obs) atualizado.obs = obs;
          else delete atualizado.obs;
          servicos[idx].pagamentos[indexPagamento] = atualizado;

          fecharModal();
          render();
          try {
            await save();
            showToast("Recebimento atualizado");
          } catch (e) {
            showToast("Erro ao salvar");
            await load();
          }
        }
      }
    ]
  });
}

function removerPagamento(servicoId, indexPagamento) {
  const idx = servicos.findIndex(s => s.id === servicoId);
  if (idx === -1) return;
  garantirArrayPagamentos(servicos[idx]);
  const p = servicos[idx].pagamentos[indexPagamento];
  if (!p) return;

  abrirModal({
    title: "Excluir recebimento",
    bodyHTML: `<p>Remover o registro de <strong>R$ ${escapeHtml(String(p.valor))}</strong> (${escapeHtml(formatarDataHora(p.data))})?</p>`,
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Excluir",
        danger: true,
        onClick: async () => {
          servicos[idx].pagamentos.splice(indexPagamento, 1);
          fecharModal();
          render();
          try {
            await save();
            showToast("Recebimento removido");
          } catch (e) {
            showToast("Erro ao salvar");
            await load();
          }
        }
      }
    ]
  });
}

function excluirServico(id) {
  const servico = servicos.find(s => s.id === id);
  if (!servico) return;
  garantirArrayPagamentos(servico);

  if (servico.status === "entregue") {
    showToast("OS entregues não podem ser excluídas");
    return;
  }

  const total = Number(servico.orcamento) || 0;
  const recebido = servico.pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  if (recebido >= total && total > 0) {
    showToast("OS quitada: não é possível excluir");
    return;
  }

  abrirModal({
    title: "Excluir ordem de serviço",
    bodyHTML: `<p>Excluir permanentemente a OS <strong>${escapeHtml(servico.id)}</strong> — ${escapeHtml(servico.cliente || "")}?</p><p class="modal-hint">Esta ação não pode ser desfeita.</p>`,
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Excluir OS",
        danger: true,
        onClick: async () => {
          servicos = servicos.filter(s => s.id !== id);
          fecharModal();
          render();
          try {
            await save();
            showToast("OS excluída");
          } catch (e) {
            showToast("Erro ao excluir");
            await load();
          }
        }
      }
    ]
  });
}

async function arquivarServico(id) {
  const idx = servicos.findIndex(s => s.id === id);
  if (idx === -1) return;
  servicos[idx].arquivado = true;
  render();
  try {
    await save();
  } catch (e) {
    await load();
  }
}

function confirmarArquivamento(id) {
  const servico = servicos.find(s => s.id === id);
  if (!servico) return;
  if (servico.arquivado) {
    showToast("Essa OS ja esta no historico");
    return;
  }
  if ((servico.status || "entrada") !== "entregue") {
    showToast("Arquivamento liberado apenas para OS concluidas (Entregue)");
    return;
  }
  abrirModal({
    title: "Arquivar ordem de serviço",
    bodyHTML: `<p>Arquivar a OS <strong>${escapeHtml(servico.id)}</strong> — ${escapeHtml(servico.cliente || "")}?</p><p class="modal-hint">Ela sai do quadro e pode ser vista em Histórico.</p>`,
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Arquivar",
        primary: true,
        onClick: async () => {
          fecharModal();
          await arquivarServico(id);
          showToast("OS arquivada no historico");
        }
      }
    ]
  });
}

async function desarquivarServico(id) {
  const idx = servicos.findIndex(s => s.id === id);
  if (idx === -1) return;
  servicos[idx].arquivado = false;
  render();
  try {
    await save();
  } catch (e) {
    await load();
  }
}

function confirmarDesarquivamento(id) {
  const servico = servicos.find(s => s.id === id);
  if (!servico) return;
  abrirModal({
    title: "Desarquivar ordem de serviço",
    bodyHTML: `<p>Trazer a OS <strong>${escapeHtml(servico.id)}</strong> de volta para o quadro?</p><p class="modal-hint">Ela volta para a coluna atual: <strong>${escapeHtml(formatarStatus(servico.status || "entrada"))}</strong>.</p>`,
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Desarquivar",
        primary: true,
        onClick: async () => {
          fecharModal();
          await desarquivarServico(id);
          showToast("OS desarquivada");
          verArquivados();
        }
      }
    ]
  });
}

function verArquivados() {
  const kanban = document.getElementById("kanban");
  const arquivados = servicos.filter(s => s.arquivado);

  kanban.innerHTML = `
  <div class="topo-arquivados">
    <button type="button" class="btn-voltar" data-action="voltar">← Voltar</button>
    <h2>Histórico (arquivados)</h2>
  </div>
  ${arquivados.length === 0 ? "<p>Nenhuma OS arquivada.</p>" : ""}
  ${arquivados.map(s => `
      <div class="card">
        <div class="card-os-id">${escapeHtml(s.id)}</div>
        <b>${escapeHtml(s.cliente)}</b><br>
        ${escapeHtml(s.instrumento || "")}<br>
        ${s.orcamento ? `<div class="valor">R$ ${escapeHtml(String(s.orcamento))}</div>` : ""}
        <small>${escapeHtml(formatarStatus(s.status))}</small>
        <div class="card-footer">
          <div class="card-actions">
            <button type="button" class="card-action" data-action="unarchive" data-id="${escapeAttr(s.id)}" title="Desarquivar OS">↩️</button>
          </div>
        </div>
      </div>
    `).join("")}`;

  kanban.querySelector("[data-action=\"voltar\"]")?.addEventListener("click", () => render());
}

function exportarBackup() {
  const payload = {
    v: 1,
    exportedAt: new Date().toISOString(),
    servicos,
    catalogo: catalogoAtual
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `backup-os-local-luthieria-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  marcarBackupExportado();
  showToast("Backup baixado (OS + tabela de preços)");
}

function onImportFileChange(e) {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const legacyArray = Array.isArray(data);
      const pacote = !legacyArray && data && typeof data === "object" && data.v === 1 && Array.isArray(data.servicos);

      if (!legacyArray && !pacote) {
        showToast("Arquivo inválido: use um backup deste app (JSON)");
        return;
      }

      const nOs = pacote ? data.servicos.length : data.length;
      const temCatalogo = pacote && Array.isArray(data.catalogo) && data.catalogo.length;

      abrirModal({
        title: "Restaurar backup",
        bodyHTML: `
          <p>O arquivo contém <strong>${nOs}</strong> ordem(ns) de serviço.</p>
          ${temCatalogo ? "<p>Também há uma <strong>tabela de preços</strong> no arquivo.</p>" : ""}
          <p class="modal-hint">Isso <strong>substitui</strong> os dados neste aparelho. Faça um backup atual antes, se precisar.</p>`,
        footerButtons: [
          { label: "Cancelar", onClick: () => fecharModal() },
          {
            label: "Substituir tudo aqui",
            danger: true,
            onClick: async () => {
              if (pacote) {
                servicos = data.servicos;
                servicos.forEach(garantirArrayPagamentos);
                if (temCatalogo) {
                  catalogoAtual = normalizarCatalogo(data.catalogo);
                  await saveCatalogo();
                }
              } else {
                servicos = data;
                servicos.forEach(garantirArrayPagamentos);
              }
              fecharModal();
              render();
              renderChecklist();
              try {
                await save();
                showToast("Backup restaurado");
              } catch (err) {
                showToast("Erro ao gravar após importar");
              }
            }
          }
        ]
      });
    } catch (err) {
      showToast("JSON inválido ou arquivo corrompido");
    }
  };
  reader.readAsText(f, "UTF-8");
}

function editar(id) {
  const s = servicos.find(x => x.id === id);
  if (!s) return;
  normalizarFotosServico(s);

  document.getElementById("form-title").textContent = "Editar ordem de serviço";
  document.getElementById("cliente").value = s.cliente || "";
  document.getElementById("telefone").value = s.telefone || "";
  document.getElementById("endereco").value = s.endereco || "";
  document.getElementById("instrumento").value = s.instrumento || "";
  document.getElementById("problema").value = s.problema || "";
  document.getElementById("notasInternas").value = s.notasInternas || "";
  document.getElementById("orcamento").value = s.orcamento ?? "";
  document.getElementById("pagamento").value = s.pagamento || "pendente";
  document.getElementById("extraNome").value = s.extraNome || "";
  document.getElementById("extraValor").value = s.extraValor ?? "";
  document.getElementById("desconto").value = s.desconto ?? "";
  carregarFotosNoForm(s.fotos);

  preencherChecklistSelecionado(s.servicos);
  valorManual = false;
  editingId = id;
  abrirForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("form").addEventListener("submit", async e => {
  e.preventDefault();

  const checks = document.querySelectorAll("#checklist-servicos input:checked");
  const servicosSelecionados = Array.from(checks).map(c => c.value);

  let valorTotal = 0;
  servicosSelecionados.forEach(nome => {
    const serv = catalogoAtual.find(x => x.nome === nome);
    if (serv) valorTotal += serv.preco;
  });

  const extra = Number(document.getElementById("extraValor").value) || 0;
  const desconto = Number(document.getElementById("desconto").value) || 0;
  const valorFinal = valorManual
    ? Number(document.getElementById("orcamento").value)
    : (valorTotal + extra - desconto);

  const payloadBase = {
    cliente: document.getElementById("cliente").value,
    telefone: document.getElementById("telefone").value,
    endereco: document.getElementById("endereco").value.trim(),
    instrumento: document.getElementById("instrumento").value,
    problema: document.getElementById("problema").value,
    notasInternas: document.getElementById("notasInternas").value.trim(),
    servicos: servicosSelecionados,
    orcamento: valorFinal,
    extraNome: document.getElementById("extraNome").value,
    extraValor: extra,
    desconto,
    pagamento: document.getElementById("pagamento").value,
    fotos: {
      antes: fotosFormState.antes || "",
      depois: fotosFormState.depois || ""
    }
  };

  if (editingId) {
    const idx = servicos.findIndex(x => x.id === editingId);
    servicos[idx] = { ...servicos[idx], ...payloadBase };
    editingId = null;
  } else {
    servicos.push({
      ...payloadBase,
      id: uid(),
      status: "entrada",
      pagamentos: [],
      data: new Date().toISOString()
    });
  }

  valorManual = false;
  const btn = e.target.querySelector("button[type='submit']");
  btn.innerText = "Salvando…";
  btn.disabled = true;

  try {
    await save();
    render();
    showToast("OS salva");
  } catch (err) {
    showToast("Erro ao gravar localmente");
    await load();
  }

  btn.innerText = "Salvo!";
  setTimeout(() => {
    btn.disabled = false;
    btn.innerText = "Salvar OS";
  }, 700);

  e.target.reset();
  resetFotosForm();
  renderChecklist();
  fecharForm();
  document.getElementById("form-title").textContent = "Nova ordem de serviço";
  window.scrollTo({ top: 0, behavior: "smooth" });
});

let startX = 0;
let endX = 0;
let isSwiping = false;

document.addEventListener("touchstart", e => {
  if (e.target.closest("button, a, input, textarea, select, summary")) return;
  startX = e.touches[0].clientX;
  isSwiping = true;
});

document.addEventListener("touchmove", e => {
  if (!isSwiping) return;
  endX = e.touches[0].clientX;
});

document.addEventListener("touchend", () => {
  if (!isSwiping) return;
  const diff = endX - startX;
  if (Math.abs(diff) > 60) {
    if (diff > 0) mudarStatusDirecao(-1);
    else mudarStatusDirecao(1);
  }
  isSwiping = false;
  startX = 0;
  endX = 0;
});

async function iniciarPainel() {
  if (window.__osPainelIniciado) return;
  window.__osPainelIniciado = true;

  document.getElementById("modal-body").addEventListener("click", onCatalogRowRemoveClick);

  await loadCatalogoInMemory();
  renderChecklist();

  document.getElementById("kanban").addEventListener("click", onKanbanClick);

  document.getElementById("fab").onclick = () => {
    editingId = null;
    valorManual = false;
    document.getElementById("form").reset();
    resetFotosForm();
    document.getElementById("form-title").textContent = "Nova ordem de serviço";
    renderChecklist();
    abrirForm();
  };

  document.getElementById("busca").addEventListener("input", e => {
    filtroBusca = e.target.value;
    render();
  });

  document.getElementById("filtroStatus").addEventListener("change", e => {
    const ix = flow.indexOf(e.target.value);
    if (ix >= 0) currentStatusIndex = ix;
    render();
    if (!isMobile()) {
      requestAnimationFrame(() => scrollKanbanParaStatus(e.target.value));
    }
  });

  document.getElementById("btn-backup").addEventListener("click", exportarBackup);
  document.getElementById("btn-catalogo")?.addEventListener("click", abrirEditorCatalogo);
  document.getElementById("btn-import")?.addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file")?.addEventListener("change", onImportFileChange);

  document.getElementById("modal-close").addEventListener("click", fecharModal);
  document.querySelector("#modal-root .modal-backdrop")?.addEventListener("click", fecharModal);

  document.getElementById("fotoAntesBtn")?.addEventListener("click", () => {
    document.getElementById("fotoAntesInput")?.click();
  });
  document.getElementById("fotoDepoisBtn")?.addEventListener("click", () => {
    document.getElementById("fotoDepoisInput")?.click();
  });
  document.getElementById("fotoAntesRemover")?.addEventListener("click", () => {
    fotosFormState.antes = "";
    const el = document.getElementById("fotoAntesInput");
    if (el) el.value = "";
    atualizarPreviewFoto("antes");
  });
  document.getElementById("fotoDepoisRemover")?.addEventListener("click", () => {
    fotosFormState.depois = "";
    const el = document.getElementById("fotoDepoisInput");
    if (el) el.value = "";
    atualizarPreviewFoto("depois");
  });
  document.getElementById("fotoAntesInput")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      fotosFormState.antes = await processarFotoArquivo(file);
      atualizarPreviewFoto("antes");
      showToast("Foto de antes adicionada");
    } catch {
      showToast("Nao foi possivel processar a foto");
    }
  });
  document.getElementById("fotoDepoisInput")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      fotosFormState.depois = await processarFotoArquivo(file);
      atualizarPreviewFoto("depois");
      showToast("Foto de depois adicionada");
    } catch {
      showToast("Nao foi possivel processar a foto");
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (document.getElementById("modal-root").classList.contains("is-open")) {
        fecharModal();
      } else if (formContainer.classList.contains("is-open")) {
        fecharForm();
      }
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    setTimeout(() => tentarToastLembreteBackup(), 600);
  });

  load();
}

document.addEventListener("os-app-unlock", () => {
  iniciarPainel();
});

window.addEventListener("DOMContentLoaded", () => {
  const shell = document.getElementById("app-shell");
  if (shell && !shell.hidden) iniciarPainel();
});

window.addEventListener("resize", () => {
  if (window.__osPainelIniciado) render();
});
