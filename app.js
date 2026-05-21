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

/** Tipos comuns em oficina de cordas — valor gravado na OS = texto exibido. */
const INSTR_TIPOS = [
  "Violão 6 cordas",
  "Violão 7+ cordas",
  "Violão clássico / nylon",
  "Baixo 4 cordas",
  "Baixo 5 ou 6 cordas",
  "Ukulele",
  "Cavaquinho",
  "Viola caipira",
  "Outro cordofone",
  "Outro"
];

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

/** Catálogo local de peças/materiais (preço unitário sugerido na OS). */
const PECAS_PADRAO = [
  { nome: "Cordas violão aço 010–046", preco: 0, unidade: "jogo" },
  { nome: "Cordas violão nylon", preco: 0, unidade: "jogo" },
  { nome: "Cordas baixo 4 cordas", preco: 0, unidade: "jogo" },
  { nome: "Tarraxas (par)", preco: 0, unidade: "par" },
  { nome: "Pestana (nut) osso/sintético", preco: 0, unidade: "un" },
  { nome: "Rastilho (saddle)", preco: 0, unidade: "un" },
  { nome: "Cavalete", preco: 0, unidade: "un" },
  { nome: "Traste", preco: 0, unidade: "un" },
  { nome: "Tensor", preco: 0, unidade: "un" },
  { nome: "Capotraste", preco: 0, unidade: "un" }
];

const IDB_NAME = "luthier-os-local-v1";
const IDB_STORE = "kv";
const IDB_KEY_SERVICOS = "servicos";
const IDB_KEY_CATALOGO = "catalogo";
const IDB_KEY_PECAS = "pecas";
const IDB_KEY_CLIENTES = "clientes";
const LS_FALLBACK = "luthier-os-servicos-v1";
const LS_CATALOGO_KEY = "luthier-catalogo-local-v1";
const LS_PECAS_KEY = "luthier-pecas-local-v1";
const LS_LAST_BACKUP_EXPORT_AT = "luthier-last-backup-export-at-v1";
const LS_LAST_BACKUP_TOAST_AT = "luthier-last-backup-toast-at-v1";
const IDB_VER = 1;

const STORAGE_HINT_AUTO_HIDE_MS = 22000;
const BACKUP_TOAST_MIN_INTERVAL_MS = 1000 * 60 * 60 * 24 * 2;
const BACKUP_CONSIDER_STALE_MS = 1000 * 60 * 60 * 24 * 3;
const BACKUP_TOAST_AFTER_LOAD_MS = STORAGE_HINT_AUTO_HIDE_MS + 4000;
const APP_VERSION = "2.9.0";

let storageHintUserDismissed = false;
let storageHintHideTimer = null;
let backupToastAfterLoadTimer = null;
let swUpdatePromptAt = 0;

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

let pecasAtual = [];

function pecasPadrao() {
  return PECAS_PADRAO.map(p => ({
    nome: p.nome,
    preco: Math.max(0, Number(p.preco) || 0),
    ...((p.unidade && String(p.unidade).trim()) ? { unidade: String(p.unidade).trim() } : {})
  }));
}

function normalizarPecas(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(item => ({
      nome: String(item?.nome ?? "").trim(),
      preco: Math.max(0, Number(item?.preco) || 0),
      ...((item?.unidade && String(item.unidade).trim()) ? { unidade: String(item.unidade).trim() } : {})
    }))
    .filter(x => x.nome);
}

async function loadPecasInMemory() {
  try {
    const p = await idbGet(IDB_KEY_PECAS);
    if (Array.isArray(p)) {
      pecasAtual = normalizarPecas(p);
      return;
    }
  } catch {}
  try {
    const t = localStorage.getItem(LS_PECAS_KEY);
    if (t) {
      const p = JSON.parse(t);
      if (Array.isArray(p)) {
        pecasAtual = normalizarPecas(p);
        return;
      }
    }
  } catch {}
  pecasAtual = pecasPadrao();
}

async function savePecas() {
  try {
    await idbPut(IDB_KEY_PECAS, pecasAtual);
  } catch {
    localStorage.setItem(LS_PECAS_KEY, JSON.stringify(pecasAtual));
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
/** Cadastro local reutilizável (nome + telefone + endereço), alimentado pelas OS. */
let clientes = [];
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

function normalizarInstrumento(s) {
  if (!s || typeof s !== "object") return;
  s.instrTipo = String(s.instrTipo || "").trim();
  s.instrMarcaModelo = String(s.instrMarcaModelo || "").trim();
  s.instrAno = String(s.instrAno || "")
    .replace(/\D/g, "")
    .slice(0, 4);
  s.instrSerie = String(s.instrSerie || "").trim();
  s.instrumento = String(s.instrumento || "").trim();
}

function normalizarMateriais(s) {
  if (!s || typeof s !== "object") return;
  if (!Array.isArray(s.materiais)) {
    s.materiais = [];
    return;
  }
  s.materiais = s.materiais.map(m => ({
    desc: String(m?.desc ?? "").trim(),
    qtd: Math.max(0, Number(m?.qtd) || 0),
    valorUnit: Math.max(0, Number(m?.valorUnit) || 0)
  }));
}

function subtotalMateriaisOs(s) {
  normalizarMateriais(s);
  return Math.round(s.materiais.reduce((acc, m) => acc + m.qtd * m.valorUnit, 0) * 100) / 100;
}

function textoMateriaisBusca(s) {
  normalizarMateriais(s);
  return s.materiais.map(m => m.desc).filter(Boolean).join(" ");
}

function resumoMateriaisCsv(s) {
  normalizarMateriais(s);
  return s.materiais
    .filter(m => m.desc || m.qtd * m.valorUnit > 0)
    .map(m => {
      const sub = Math.round(m.qtd * m.valorUnit * 100) / 100;
      const d = m.desc || "?";
      return `${d} (${m.qtd}×${m.valorUnit}=${sub})`;
    })
    .join(" | ");
}

/** Texto único para card, busca e WhatsApp; OS antigas só com `instrumento` continuam legíveis. */
function resumoInstrumento(s) {
  if (!s) return "";
  normalizarInstrumento(s);
  const partes = [];
  if (s.instrTipo) partes.push(s.instrTipo);
  if (s.instrMarcaModelo) partes.push(s.instrMarcaModelo);
  if (s.instrAno) partes.push(s.instrAno);
  if (s.instrSerie) partes.push(`S/n ${s.instrSerie}`);
  const nucleo = partes.join(" · ");
  if (nucleo && s.instrumento) return `${nucleo} — ${s.instrumento}`;
  if (nucleo) return nucleo;
  return s.instrumento || "";
}

function popularSelectInstrumentoTipos() {
  const sel = document.getElementById("instrTipo");
  if (!sel || sel.dataset.osPreenchido === "1") return;
  sel.dataset.osPreenchido = "1";
  INSTR_TIPOS.forEach(t => {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  });
}

function limparCamposInstrumentoForm() {
  const tipo = document.getElementById("instrTipo");
  if (tipo) tipo.value = "";
  const mm = document.getElementById("instrMarcaModelo");
  if (mm) mm.value = "";
  const ano = document.getElementById("instrAno");
  if (ano) ano.value = "";
  const ser = document.getElementById("instrSerie");
  if (ser) ser.value = "";
  const liv = document.getElementById("instrumento");
  if (liv) liv.value = "";
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
  hideClienteSuggestions();
  hidePecaSuggestions();
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
  normalizarInstrumento(s);
  const q = filtroBusca.trim().toLowerCase();
  if (!q) return true;
  normalizarMateriais(s);
  const parts = [
    s.id,
    s.cliente,
    resumoInstrumento(s),
    s.problema,
    s.notasInternas,
    s.endereco,
    s.telefone,
    textoMateriaisBusca(s),
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

const CONTATO_SUPORTE_OS = {
  email: "baratieriluthieria@gmail.com",
  telDisplay: "(45) 92002-8659",
  telHref: "+5545920028659",
  wa: "5545920028659"
};

function modalApenasFechar() {
  return [{ label: "Fechar", onClick: () => fecharModal() }];
}

function abrirModalContatoOS() {
  const { email, telDisplay, telHref, wa } = CONTATO_SUPORTE_OS;
  abrirModal({
    title: "Contato",
    bodyHTML: `
      <p class="modal-hint">Para recuperar o código de acesso ou falar sobre o painel:</p>
      <ul class="modal-help-list">
        <li><a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a></li>
        <li><a href="tel:${escapeAttr(telHref)}">${escapeHtml(telDisplay)}</a></li>
        <li><a href="https://wa.me/${escapeAttr(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
      </ul>`,
    footerButtons: modalApenasFechar()
  });
}

function abrirModalSobrePainelOS() {
  abrirModal({
    title: "Sobre o Painel OS Baratieri",
    bodyHTML: `
      <div class="modal-prose">
        <p>O <strong>Painel OS Baratieri</strong> organiza <strong>ordens de serviço</strong> em colunas, do recebimento do instrumento até a entrega.</p>
        <p>Os registros ficam <strong>só neste aparelho</strong> (navegador). Use <strong>Backup JSON</strong> com frequência para não perder o histórico de OS, <strong>clientes salvos</strong> e tabela de preços.</p>
        <p>Complemento ao ecossistema <strong>Método Baratieri</strong> / Luthieria Baratieri.</p>
      </div>`,
    footerButtons: modalApenasFechar()
  });
}

function abrirModalManualPainelOS() {
  abrirModal({
    title: "Manual de uso (resumo)",
    bodyHTML: `
      <div class="modal-prose modal-prose-compact">
        <ol class="modal-help-steps">
          <li><strong>Acesso:</strong> informe o código recebido. Se perdeu, use <strong>Contato</strong> no rodapé (também na tela de login).</li>
          <li><strong>Nova OS:</strong> <strong>＋ Nova OS</strong>, preencha os dados e salve. O card aparece em <em>Entrada</em>.</li>
          <li><strong>Cliente:</strong> ao digitar o nome, aparecem <strong>sugestões</strong> de quem já passou pela oficina; toque para preencher telefone e endereço.</li>
          <li><strong>Duplicar OS:</strong> no card, use <strong>📋</strong> para criar uma nova OS na Entrada com o mesmo cliente (e instrumento); ajuste o serviço e salve.</li>
          <li><strong>Fluxo:</strong> no card, use <strong>➡️</strong> para avançar a etapa. No celular, deslize para alternar a coluna em foco.</li>
          <li><strong>Busca:</strong> filtre por cliente, instrumento ou texto da OS.</li>
          <li><strong>Preços:</strong> o botão <strong>Preços</strong> edita a tabela da checklist e do orçamento.</li>
          <li><strong>Peças:</strong> o botão <strong>Peças</strong> cadastra cordas, tarrachas etc. com preço unitário sugerido; na OS, ao digitar material, aparecem sugestões da sua tabela.</li>
          <li><strong>Material:</strong> linhas com item, quantidade e valor unitário; marque <strong>Somar material no total</strong> para entrar no orçamento automático (desmarque só para anotar peças sem alterar o total).</li>
          <li><strong>Instrumento:</strong> escolha o <strong>tipo</strong>, marca/modelo, ano e série; use <strong>Complemento</strong> para detalhes livres. OS antigas só com texto continuam no resumo do card.</li>
          <li><strong>CSV:</strong> exporte uma <strong>planilha</strong> das OS (valores e recebimentos); opcional incluir arquivadas.</li>
          <li><strong>Backup / importar:</strong> exporte JSON com regularidade. Importar substitui os dados locais — use só se souber o que está fazendo.</li>
          <li><strong>Histórico:</strong> OS arquivadas ficam em <strong>Histórico</strong>.</li>
        </ol>
      </div>`,
    footerButtons: modalApenasFechar()
  });
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
  if (!btn) return;
  const servWrap = document.getElementById("catalog-rows");
  const pecasWrap = document.getElementById("pecas-rows");
  const inServ = servWrap?.contains(btn);
  const inPecas = pecasWrap?.contains(btn);
  if (!inServ && !inPecas) return;

  if (inServ) {
    if (servWrap.querySelectorAll(".catalog-row").length <= 1) {
      showToast("Mantenha pelo menos um serviço na tabela");
      return;
    }
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

function htmlPecasRow(p) {
  return `
    <div class="catalog-row">
      <div class="modal-field">
        <label>Nome da peça / material</label>
        <input type="text" class="peca-nome" value="${escapeAttr(p.nome)}" placeholder="Ex.: Cordas 010–046" autocomplete="off">
      </div>
      <div class="modal-field catalog-row-tools">
        <div class="catalog-preco-wrap">
          <label>Preço unit. (R$)</label>
          <input type="number" class="peca-preco" min="0" step="0.01" value="${escapeAttr(String(p.preco ?? 0))}">
        </div>
        <button type="button" class="btn-cat-remove">Remover</button>
      </div>
      <div class="modal-field">
        <label>Unidade <span class="hint">(opcional)</span></label>
        <input type="text" class="peca-unidade" value="${escapeAttr(p.unidade || "")}" placeholder="jogo, par, un…" autocomplete="off">
      </div>
    </div>`;
}

function lerPecasDoModal() {
  const root = document.getElementById("pecas-rows");
  if (!root) return [];
  const out = [];
  root.querySelectorAll(".catalog-row").forEach(row => {
    const nome = (row.querySelector(".peca-nome")?.value || "").trim();
    const preco = Number(row.querySelector(".peca-preco")?.value) || 0;
    const unidade = (row.querySelector(".peca-unidade")?.value || "").trim();
    if (!nome) return;
    out.push({ nome, preco, ...(unidade ? { unidade } : {}) });
  });
  return out;
}

function abrirEditorPecas() {
  const rowsHtml = pecasAtual.length
    ? pecasAtual.map(p => htmlPecasRow(p)).join('<hr class="catalog-sep">')
    : htmlPecasRow({ nome: "", preco: 0, unidade: "" });
  abrirModal({
    title: "Catálogo de peças e materiais",
    bodyHTML: `
      <p class="modal-hint">Cadastre o que você usa na oficina (cordas, tarrachas, etc.) e o <strong>preço unitário sugerido</strong>. Na OS, ao preencher material, as sugestões vêm desta tabela. Dados só neste aparelho.</p>
      <div id="pecas-rows">${rowsHtml}</div>
      <button type="button" class="btn-modal-secondary catalog-add-btn" id="pecas-add" style="width:100%;margin-top:10px">＋ Incluir peça</button>`,
    footerButtons: [
      { label: "Fechar", onClick: () => fecharModal() },
      {
        label: "Restaurar padrão",
        onClick: async () => {
          if (!confirm("Substituir todo o catálogo de peças pelos itens iniciais do aplicativo?")) return;
          pecasAtual = pecasPadrao();
          await savePecas();
          fecharModal();
          showToast("Catálogo de peças restaurado");
        }
      },
      {
        label: "Salvar catálogo",
        primary: true,
        onClick: async () => {
          const novo = lerPecasDoModal();
          const comNome = novo.filter(x => x.nome);
          const chaves = comNome.map(x => x.nome.toLowerCase());
          if (chaves.length && new Set(chaves).size !== chaves.length) {
            showToast("Há duas peças com o mesmo nome — ajuste antes de salvar");
            return;
          }
          pecasAtual = novo;
          await savePecas();
          fecharModal();
          showToast(pecasAtual.length ? "Catálogo de peças salvo" : "Catálogo vazio — cadastre peças quando quiser");
        }
      }
    ]
  });
  document.getElementById("pecas-add").onclick = () => {
    const root = document.getElementById("pecas-rows");
    const sep = root.querySelector(".catalog-row") ? '<hr class="catalog-sep">' : "";
    root.insertAdjacentHTML("beforeend", sep + htmlPecasRow({ nome: "", preco: 0, unidade: "" }));
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

function preencherVersaoRodape() {
  const el = document.getElementById("app-version-badge");
  if (!el) return;
  el.textContent = `v${APP_VERSION}`;
}

function mostrarAvisoAtualizacao() {
  const now = Date.now();
  if (now - swUpdatePromptAt < 3500) return;
  swUpdatePromptAt = now;
  showToast("Nova versão disponível. Toque aqui para atualizar.");
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.style.cursor = "pointer";
  const onClick = () => {
    window.location.reload();
  };
  toast.addEventListener("click", onClick, { once: true });
  setTimeout(() => {
    toast.style.cursor = "";
  }, 2800);
}

function monitorarAtualizacaoServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    if (!reg) return;

    const tratarWaiting = () => {
      if (!reg.waiting) return;
      mostrarAvisoAtualizacao();
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    };

    if (reg.waiting) tratarWaiting();

    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          tratarWaiting();
        }
      });
    });
  }).catch(() => {});

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (window.__osSwReloading) return;
    window.__osSwReloading = true;
    window.location.reload();
  });
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

function htmlMateriaisRow(m = {}) {
  const desc = escapeAttr(m.desc || "");
  const qtd =
    m.qtd != null && m.qtd !== ""
      ? escapeAttr(String(m.qtd))
      : "";
  const vu =
    m.valorUnit != null && m.valorUnit !== ""
      ? escapeAttr(String(m.valorUnit))
      : "";
  return `
    <div class="mat-row">
      <div class="mat-desc-cell field-autocomplete-wrap">
        <input type="text" class="mat-desc" placeholder="Ex.: cordas" maxlength="120" value="${desc}" autocomplete="off" spellcheck="false">
        <div class="peca-suggestions cliente-suggestions" role="listbox" hidden aria-label="Peças do catálogo"></div>
      </div>
      <input type="number" class="mat-qtd" placeholder="Qtd" min="0" step="any" value="${qtd}">
      <input type="number" class="mat-unit" placeholder="Unit." min="0" step="0.01" value="${vu}">
      <button type="button" class="btn-mat-remove" title="Remover linha">×</button>
    </div>`;
}

function filtrarSugestoesPecas(texto) {
  const q = String(texto || "").trim().toLowerCase();
  if (!q || !pecasAtual.length) return [];
  return pecasAtual
    .filter(p => p.nome.toLowerCase().includes(q))
    .slice(0, 8);
}

function hidePecaSuggestions() {
  document.querySelectorAll(".peca-suggestions").forEach(box => {
    box.hidden = true;
    box.innerHTML = "";
  });
  document.querySelectorAll(".mat-desc").forEach(inp => inp.setAttribute("aria-expanded", "false"));
}

function aplicarPecaSugerida(peca, inputEl) {
  const row = inputEl?.closest(".mat-row");
  if (!row || !peca) return;
  const desc = row.querySelector(".mat-desc");
  const unit = row.querySelector(".mat-unit");
  if (desc) desc.value = peca.nome;
  if (unit && (Number(peca.preco) || 0) > 0) unit.value = peca.preco;
  hidePecaSuggestions();
  calcularTotalChecklist();
}

function renderPecaSuggestionsForInput(inputEl) {
  if (!inputEl || !formContainer?.classList.contains("is-open")) return;
  hidePecaSuggestions();
  const list = filtrarSugestoesPecas(inputEl.value);
  const box = inputEl.closest(".mat-desc-cell")?.querySelector(".peca-suggestions");
  if (!box) return;
  if (!list.length) return;

  box.innerHTML = list
    .map((p, i) => {
      const meta = [];
      if ((Number(p.preco) || 0) > 0) meta.push(`R$ ${p.preco}`);
      if (p.unidade) meta.push(p.unidade);
      const metaHtml = meta.length
        ? `<span class="cj-meta">${escapeHtml(meta.join(" · "))}</span>`
        : "";
      return `
    <button type="button" class="cliente-suggestion-item peca-suggestion-item" role="option" data-pi="${i}">
      <span class="cj-nome">${escapeHtml(p.nome)}</span>
      ${metaHtml}
    </button>`;
    })
    .join("");

  box.hidden = false;
  inputEl.setAttribute("aria-expanded", "true");

  box.querySelectorAll(".peca-suggestion-item").forEach(btn => {
    btn.addEventListener("mousedown", e => {
      e.preventDefault();
      const i = Number(btn.dataset.pi);
      if (Number.isFinite(i) && list[i]) aplicarPecaSugerida(list[i], inputEl);
    });
  });
}

function renderMateriaisForm(lista) {
  const body = document.getElementById("materiais-body");
  if (!body) return;
  const rows = Array.isArray(lista) && lista.length ? lista : [{}];
  body.innerHTML = rows.map(m => htmlMateriaisRow(m)).join("");
}

function getMateriaisFromForm() {
  const body = document.getElementById("materiais-body");
  if (!body) return [];
  const out = [];
  body.querySelectorAll(".mat-row").forEach(row => {
    const desc = (row.querySelector(".mat-desc")?.value || "").trim();
    const qtd = Math.max(0, Number(row.querySelector(".mat-qtd")?.value) || 0);
    const valorUnit = Math.max(0, Number(row.querySelector(".mat-unit")?.value) || 0);
    if (!desc && qtd * valorUnit === 0) return;
    out.push({ desc, qtd, valorUnit });
  });
  return out;
}

function totalMateriaisDoForm() {
  const body = document.getElementById("materiais-body");
  if (!body) return 0;
  let t = 0;
  body.querySelectorAll(".mat-row").forEach(row => {
    const q = Math.max(0, Number(row.querySelector(".mat-qtd")?.value) || 0);
    const u = Math.max(0, Number(row.querySelector(".mat-unit")?.value) || 0);
    t += q * u;
  });
  return Math.round(t * 100) / 100;
}

function appendMateriaisRow() {
  const body = document.getElementById("materiais-body");
  if (!body) return;
  body.insertAdjacentHTML("beforeend", htmlMateriaisRow({}));
  calcularTotalChecklist();
}

function wireMateriaisFormOnce() {
  const wrap = document.getElementById("materiais-wrap");
  if (!wrap || wrap.dataset.osWired === "1") return;
  wrap.dataset.osWired = "1";
  const body = document.getElementById("materiais-body");
  body?.addEventListener("input", e => {
    if (e.target.classList.contains("mat-desc")) renderPecaSuggestionsForInput(e.target);
    calcularTotalChecklist();
  });
  body?.addEventListener("focusin", e => {
    if (e.target.classList.contains("mat-desc")) renderPecaSuggestionsForInput(e.target);
  });
  wrap.querySelector("#material-somar-orcamento")?.addEventListener("change", calcularTotalChecklist);
  wrap.addEventListener("click", e => {
    if (e.target.closest("#btn-mat-add")) {
      appendMateriaisRow();
      return;
    }
    const rm = e.target.closest(".btn-mat-remove");
    if (!rm || !body) return;
    const row = rm.closest(".mat-row");
    const rows = body.querySelectorAll(".mat-row");
    if (rows.length <= 1) {
      const d = row.querySelector(".mat-desc");
      const q = row.querySelector(".mat-qtd");
      const u = row.querySelector(".mat-unit");
      if (d) d.value = "";
      if (q) q.value = "";
      if (u) u.value = "";
    } else {
      row.remove();
    }
    calcularTotalChecklist();
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
  const matIncl =
    document.getElementById("material-somar-orcamento")?.checked !== false ? totalMateriaisDoForm() : 0;
  total = total + extra + matIncl - desconto;
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

function chaveCliente(nome, telefone) {
  const n = String(nome || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const d = String(telefone || "").replace(/\D/g, "");
  return `${n}::${d}`;
}

function normalizarClienteRegistro(c) {
  return {
    id: String(c?.id || "").trim() || `cli-${Date.now()}`,
    nome: String(c?.nome || "").trim(),
    telefone: String(c?.telefone || "").trim(),
    endereco: String(c?.endereco || "").trim(),
    atualizadoEm: c?.atualizadoEm || new Date().toISOString()
  };
}

function buildClientesFromServicos(lista) {
  const byKey = new Map();
  for (const s of lista) {
    const nome = String(s?.cliente || "").trim();
    if (!nome) continue;
    const telefone = String(s?.telefone || "").trim();
    const endereco = String(s?.endereco || "").trim();
    const k = chaveCliente(nome, telefone);
    const prev = byKey.get(k);
    if (prev) {
      if (endereco && !prev.endereco) prev.endereco = endereco;
      continue;
    }
    byKey.set(k, {
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      nome,
      telefone,
      endereco,
      atualizadoEm: new Date().toISOString()
    });
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  );
}

async function saveClientes() {
  try {
    await idbPut(IDB_KEY_CLIENTES, clientes);
  } catch (e) {
    console.warn("Gravar clientes:", e);
  }
}

async function loadClientesInMemory() {
  try {
    const raw = await idbGet(IDB_KEY_CLIENTES);
    if (Array.isArray(raw) && raw.length) {
      clientes = raw.map(normalizarClienteRegistro).filter(c => c.nome);
      return;
    }
  } catch {
    /* ignore */
  }
  clientes = buildClientesFromServicos(servicos);
  if (clientes.length) await saveClientes();
}

function indiceClientePorChave(nome, telefone) {
  const k = chaveCliente(nome, telefone);
  return clientes.findIndex(c => chaveCliente(c.nome, c.telefone) === k);
}

async function upsertClienteFromOsForm(nomeRaw, telefoneRaw, enderecoRaw) {
  const nome = String(nomeRaw || "").trim();
  if (!nome) return;
  const telefone = String(telefoneRaw || "").trim();
  const endereco = String(enderecoRaw || "").trim();
  const ix = indiceClientePorChave(nome, telefone);
  const agora = new Date().toISOString();
  if (ix >= 0) {
    clientes[ix] = {
      ...clientes[ix],
      nome,
      telefone,
      endereco: endereco || clientes[ix].endereco,
      atualizadoEm: agora
    };
  } else {
    clientes.push({
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      nome,
      telefone,
      endereco,
      atualizadoEm: agora
    });
  }
  clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  await saveClientes();
}

function filtrarSugestoesClientes(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const digitos = q.replace(/\D/g, "");
  let list = clientes;
  if (q) {
    list = clientes.filter(c => {
      const nomeOk = c.nome.toLowerCase().includes(q);
      const tel = String(c.telefone || "").replace(/\D/g, "");
      const telOk = digitos.length >= 3 && tel.includes(digitos);
      return nomeOk || telOk;
    });
  }
  return list.slice(0, 8);
}

function hideClienteSuggestions() {
  const box = document.getElementById("cliente-suggestions");
  const inp = document.getElementById("cliente");
  if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
  inp?.setAttribute("aria-expanded", "false");
}

function aplicarClienteSugerido(c) {
  document.getElementById("cliente").value = c.nome;
  document.getElementById("telefone").value = c.telefone || "";
  document.getElementById("endereco").value = c.endereco || "";
  hideClienteSuggestions();
}

function renderClienteSuggestions() {
  const box = document.getElementById("cliente-suggestions");
  const inp = document.getElementById("cliente");
  if (!box || !inp || !formContainer?.classList.contains("is-open")) return;

  const list = filtrarSugestoesClientes(inp.value);
  if (!list.length) {
    hideClienteSuggestions();
    return;
  }

  box.innerHTML = list
    .map(
      (c, i) => `
    <button type="button" class="cliente-suggestion-item" role="option" data-ci="${i}">
      <span class="cj-nome">${escapeHtml(c.nome)}</span>
      <span class="cj-meta">${escapeHtml(c.telefone || "sem telefone")}</span>
    </button>`
    )
    .join("");

  box.hidden = false;
  inp.setAttribute("aria-expanded", "true");

  box.querySelectorAll(".cliente-suggestion-item").forEach(btn => {
    btn.addEventListener("mousedown", e => {
      e.preventDefault();
      const i = Number(btn.dataset.ci);
      if (Number.isFinite(i) && list[i]) aplicarClienteSugerido(list[i]);
    });
  });
}

function bindClienteAutocompleteOnce() {
  if (window.__osClienteAcBound) return;
  window.__osClienteAcBound = true;

  const inp = document.getElementById("cliente");
  if (!inp) return;

  inp.addEventListener("input", () => renderClienteSuggestions());
  inp.addEventListener("focus", () => renderClienteSuggestions());

  document.addEventListener("click", e => {
    const wrap = document.querySelector("#cliente")?.closest(".field-autocomplete-wrap");
    if (wrap && !wrap.contains(e.target)) hideClienteSuggestions();
    if (!e.target.closest(".mat-desc-cell")) hidePecaSuggestions();
  });
}

async function duplicarOs(origId) {
  const s = servicos.find(x => x.id === origId);
  if (!s) return;
  normalizarFotosServico(s);
  const newId = uid();
  normalizarInstrumento(s);
  const novo = {
    id: newId,
    cliente: s.cliente || "",
    telefone: s.telefone || "",
    endereco: s.endereco || "",
    instrumento: s.instrumento || "",
    instrTipo: s.instrTipo || "",
    instrMarcaModelo: s.instrMarcaModelo || "",
    instrAno: s.instrAno || "",
    instrSerie: s.instrSerie || "",
    problema: "",
    notasInternas: "",
    servicos: [],
    extraNome: "",
    extraValor: 0,
    desconto: 0,
    orcamento: 0,
    materiais: [],
    materialSomarOrcamento: true,
    pagamento: "pendente",
    fotos: { antes: "", depois: "" },
    status: "entrada",
    pagamentos: [],
    data: new Date().toISOString(),
    arquivado: false
  };
  normalizarInstrumento(novo);
  servicos.push(novo);
  try {
    await save();
    await upsertClienteFromOsForm(novo.cliente, novo.telefone, novo.endereco);
    showToast("OS duplicada na Entrada — ajuste e salve");
    currentStatusIndex = 0;
    syncFiltroSelectFromIndex();
    render();
    editar(newId);
  } catch (err) {
    servicos.pop();
    showToast("Erro ao duplicar OS");
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
  servicos.forEach(normalizarInstrumento);
  servicos.forEach(normalizarMateriais);
  await loadClientesInMemory();
  bindClienteAutocompleteOnce();
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

function precoServicoCatalogo(nome) {
  const item = catalogoAtual.find(x => x.nome === nome);
  if (!item) return null;
  const n = Number(item.preco);
  return Number.isFinite(n) ? n : null;
}

function renderCard(s, statusColuna = null) {
  garantirArrayPagamentos(s);
  normalizarFotosServico(s);
  normalizarInstrumento(s);
  normalizarMateriais(s);
  const instLinha = resumoInstrumento(s);

  const matSub = subtotalMateriaisOs(s);
  const matSomado = s.materialSomarOrcamento !== false ? matSub : 0;
  const base = (s.orcamento || 0)
    - (Number(s.extraValor) || 0)
    - matSomado
    + (Number(s.desconto) || 0);

  const total = Number(s.orcamento) || 0;
  const recebido = s.pagamentos.reduce((soma, p) => soma + (Number(p.valor) || 0), 0);
  const restante = total - recebido;
  const pago = restante <= 0 && total > 0;
  const progresso = total > 0 ? (recebido / total) * 100 : 0;
  const mostrarFinanceiro = total > 0 || recebido > 0;

  const temMatLista = s.materiais.some(m => m.desc || m.qtd * m.valorUnit > 0);
  const matLinhasHtml = s.materiais
    .filter(m => m.desc || m.qtd * m.valorUnit > 0)
    .map(m => {
      const sub = Math.round(m.qtd * m.valorUnit * 100) / 100;
      const label = m.desc || "(sem nome)";
      const bits = [];
      if (m.qtd) bits.push(`${m.qtd} un.`);
      if (m.valorUnit) bits.push(`R$ ${m.valorUnit}/un`);
      if (sub > 0) bits.push(`= R$ ${sub}`);
      const tail = bits.length ? ` — ${bits.join(" · ")}` : "";
      return `<div class="card-linha-detalhe">${escapeHtml(`${label}${tail}`)}</div>`;
    })
    .join("");

  const temServicosOuExtra = (s.servicos?.length > 0) || !!String(s.extraNome || "").trim();
  const extraVal = Number(s.extraValor) || 0;
  const parcelaTabelaEExtra = (Number(base) || 0) + extraVal;
  let sumarioServicos = "Serviços e extra";
  if (parcelaTabelaEExtra > 0) {
    sumarioServicos += ` — R$ ${parcelaTabelaEExtra}`;
  }
  const servicosLinhasHtml = (s.servicos || [])
    .map(serv => {
      const p = precoServicoCatalogo(serv);
      if (p != null) {
        return `<div class="card-linha-detalhe">${escapeHtml(serv)} <span class="card-linha-valor">R$ ${escapeHtml(String(p))}</span></div>`;
      }
      return `<div class="card-linha-detalhe">${escapeHtml(serv)}</div>`;
    })
    .join("");
  const extraLinhaHtml = String(s.extraNome || "").trim()
    ? `<div class="card-linha-detalhe card-linha-extra"><span class="card-linha-extra-tit">Extra</span> · ${escapeHtml(s.extraNome)}${extraVal ? ` <span class="card-linha-valor">R$ ${escapeHtml(String(extraVal))}</span>` : ""}</div>`
    : "";

  const detServicosExtraHtml = temServicosOuExtra
    ? `<details class="card-notas card-notas--plain card-notas--serv-extra">
        <summary>${escapeHtml(sumarioServicos)}</summary>
        <div class="notas-body">
          ${servicosLinhasHtml}
          ${extraLinhaHtml}
        </div>
      </details>`
    : "";

  let sumarioMaterial = "Material";
  if (matSub > 0) sumarioMaterial += ` — R$ ${matSub}`;
  if (s.materialSomarOrcamento === false) sumarioMaterial += " (só registro)";

  const detMaterialHtml = temMatLista
    ? `<details class="card-notas card-notas--plain card-notas--material">
        <summary>${escapeHtml(sumarioMaterial)}</summary>
        <div class="notas-body">
          ${s.materialSomarOrcamento === false ? `<p class="mat-nao-soma">Não entra no total desta OS.</p>` : ""}
          <div class="mat-linhas">${matLinhasHtml}</div>
        </div>
      </details>`
    : "";

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
          <span class="instrumento" title="${escapeAttr(instLinha)}">${escapeHtml(instLinha)}</span>
        </div>
        <div class="data">${formatarData(s.data)}</div>
      </div>
      ${fotosHtml}
      ${notasBlock}
      ${(temServicosOuExtra || temMatLista) ? `
        <div class="card-servicos">
          ${detServicosExtraHtml}
          ${detMaterialHtml}
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
          <button type="button" class="card-action" data-action="duplicate" data-id="${idAttr}" title="Duplicar OS (mesmo cliente)">📋</button>
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
    case "duplicate":
      duplicarOs(id);
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
        ${escapeHtml(resumoInstrumento(s))}<br>
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

/** Célula CSV (;) com aspas se necessário — compatível com Excel em PT-BR. */
function escapeCsvCell(raw) {
  const s = String(raw ?? "");
  if (/[;\r\n"]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function totalRecebidoOs(s) {
  garantirArrayPagamentos(s);
  return s.pagamentos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
}

function abrirModalExportarCsv() {
  abrirModal({
    title: "Exportar OS (CSV)",
    bodyHTML: `
      <p class="modal-hint">Planilha com dados das ordens de serviço, serviços marcados e valores. Separador <strong>;</strong> (padrão Excel Brasil). Codificação UTF-8.</p>
      <label class="modal-field csv-export-opt">
        <input type="checkbox" id="csv-incluir-arquivadas">
        <span>Incluir OS do histórico (arquivadas)</span>
      </label>`,
    footerButtons: [
      { label: "Cancelar", onClick: () => fecharModal() },
      {
        label: "Baixar CSV",
        primary: true,
        onClick: () => {
          const incluir = document.getElementById("csv-incluir-arquivadas")?.checked === true;
          fecharModal();
          baixarCsvOs(incluir);
        }
      }
    ]
  });
}

function baixarCsvOs(incluirArquivadas) {
  const rows = servicos.filter(s => incluirArquivadas || !s.arquivado);
  rows.sort((a, b) => {
    const ta = new Date(a.data || 0).getTime();
    const tb = new Date(b.data || 0).getTime();
    return tb - ta;
  });

  const headers = [
    "ID",
    "Data",
    "Status",
    "Arquivada",
    "Cliente",
    "Telefone",
    "Endereco",
    "InstrTipo",
    "InstrMarcaModelo",
    "InstrAno",
    "InstrSerie",
    "InstrComplemento",
    "InstrumentoResumo",
    "Servicos",
    "ExtraNome",
    "ExtraValor",
    "Desconto",
    "Orcamento",
    "Recebido",
    "Saldo",
    "PagamentoLegado",
    "Problema",
    "NotasInternas",
    "MaterialResumo",
    "MaterialSubtotal",
    "MaterialSomarNoTotal"
  ];

  const lines = [headers.join(";")];

  for (const s of rows) {
    garantirArrayPagamentos(s);
    normalizarInstrumento(s);
    normalizarMateriais(s);
    const rec = totalRecebidoOs(s);
    const orc = Number(s.orcamento) || 0;
    const servs = Array.isArray(s.servicos) ? s.servicos.join(" | ") : "";
    const line = [
      s.id,
      (s.data || "").slice(0, 10),
      s.status || "entrada",
      s.arquivado ? "sim" : "nao",
      s.cliente,
      s.telefone,
      s.endereco,
      s.instrTipo || "",
      s.instrMarcaModelo || "",
      s.instrAno || "",
      s.instrSerie || "",
      s.instrumento || "",
      resumoInstrumento(s),
      servs,
      s.extraNome || "",
      String(Number(s.extraValor) || 0),
      String(Number(s.desconto) || 0),
      String(orc),
      String(rec),
      String(Math.round((orc - rec) * 100) / 100),
      s.pagamento || "pendente",
      s.problema || "",
      s.notasInternas || "",
      resumoMateriaisCsv(s),
      String(subtotalMateriaisOs(s)),
      s.materialSomarOrcamento !== false ? "sim" : "nao"
    ].map(escapeCsvCell);
    lines.push(line.join(";"));
  }

  const bom = "\uFEFF";
  const csv = bom + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `painel-os-relatorio-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(rows.length ? `${rows.length} OS no CSV` : "CSV só com cabeçalho (nenhuma OS)");
}

function exportarBackup() {
  const payload = {
    v: 1,
    exportedAt: new Date().toISOString(),
    servicos,
    catalogo: catalogoAtual,
    pecas: pecasAtual,
    clientes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `backup-os-local-luthieria-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  marcarBackupExportado();
  showToast("Backup baixado (OS + clientes + preços + peças)");
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
      const temPecas = pacote && Array.isArray(data.pecas);
      const temClientes = pacote && Array.isArray(data.clientes) && data.clientes.length;

      abrirModal({
        title: "Restaurar backup",
        bodyHTML: `
          <p>O arquivo contém <strong>${nOs}</strong> ordem(ns) de serviço.</p>
          ${temCatalogo ? "<p>Também há uma <strong>tabela de preços</strong> no arquivo.</p>" : ""}
          ${temPecas ? `<p>Também há <strong>catálogo de peças</strong> (${data.pecas.length} item(ns)).</p>` : ""}
          ${temClientes ? "<p>Também há <strong>clientes salvos</strong> para sugestão no formulário.</p>" : ""}
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
                servicos.forEach(normalizarInstrumento);
                servicos.forEach(normalizarMateriais);
                if (temCatalogo) {
                  catalogoAtual = normalizarCatalogo(data.catalogo);
                  await saveCatalogo();
                }
                if (temPecas) {
                  pecasAtual = normalizarPecas(data.pecas);
                  await savePecas();
                }
                if (Array.isArray(data.clientes) && data.clientes.length) {
                  clientes = data.clientes.map(normalizarClienteRegistro).filter(c => c.nome);
                } else {
                  clientes = buildClientesFromServicos(servicos);
                }
                await saveClientes();
              } else {
                servicos = data;
                servicos.forEach(garantirArrayPagamentos);
                servicos.forEach(normalizarInstrumento);
                servicos.forEach(normalizarMateriais);
                clientes = buildClientesFromServicos(servicos);
                await saveClientes();
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
  normalizarInstrumento(s);
  normalizarMateriais(s);

  document.getElementById("form-title").textContent = "Editar ordem de serviço";
  document.getElementById("cliente").value = s.cliente || "";
  document.getElementById("telefone").value = s.telefone || "";
  document.getElementById("endereco").value = s.endereco || "";
  const tipoEl = document.getElementById("instrTipo");
  const tipoVal = s.instrTipo || "";
  if (tipoEl) {
    tipoEl.value = tipoVal;
    if (tipoVal && tipoEl.value !== tipoVal) {
      const o = document.createElement("option");
      o.value = tipoVal;
      o.textContent = tipoVal;
      tipoEl.appendChild(o);
      tipoEl.value = tipoVal;
    }
  }
  document.getElementById("instrMarcaModelo").value = s.instrMarcaModelo || "";
  document.getElementById("instrAno").value = s.instrAno || "";
  document.getElementById("instrSerie").value = s.instrSerie || "";
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
  renderMateriaisForm(s.materiais);
  const chkMat = document.getElementById("material-somar-orcamento");
  if (chkMat) chkMat.checked = s.materialSomarOrcamento !== false;
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
  const matIncl =
    document.getElementById("material-somar-orcamento")?.checked !== false ? totalMateriaisDoForm() : 0;
  const valorFinal = valorManual
    ? Number(document.getElementById("orcamento").value)
    : (valorTotal + extra + matIncl - desconto);

  const payloadBase = {
    cliente: document.getElementById("cliente").value,
    telefone: document.getElementById("telefone").value,
    endereco: document.getElementById("endereco").value.trim(),
    instrTipo: (document.getElementById("instrTipo")?.value || "").trim(),
    instrMarcaModelo: (document.getElementById("instrMarcaModelo")?.value || "").trim(),
    instrAno: (document.getElementById("instrAno")?.value || "").replace(/\D/g, "").slice(0, 4),
    instrSerie: (document.getElementById("instrSerie")?.value || "").trim(),
    instrumento: document.getElementById("instrumento").value.trim(),
    problema: document.getElementById("problema").value,
    notasInternas: document.getElementById("notasInternas").value.trim(),
    servicos: servicosSelecionados,
    orcamento: valorFinal,
    extraNome: document.getElementById("extraNome").value,
    extraValor: extra,
    desconto,
    materiais: getMateriaisFromForm(),
    materialSomarOrcamento: document.getElementById("material-somar-orcamento")?.checked !== false,
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
    await upsertClienteFromOsForm(payloadBase.cliente, payloadBase.telefone, payloadBase.endereco);
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
  renderMateriaisForm([]);
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

  popularSelectInstrumentoTipos();

  document.getElementById("modal-body").addEventListener("click", onCatalogRowRemoveClick);

  await loadCatalogoInMemory();
  await loadPecasInMemory();
  renderChecklist();
  wireMateriaisFormOnce();
  renderMateriaisForm([]);

  document.getElementById("kanban").addEventListener("click", onKanbanClick);

  document.getElementById("fab").onclick = () => {
    hideClienteSuggestions();
    hidePecaSuggestions();
    editingId = null;
    valorManual = false;
    document.getElementById("form").reset();
    resetFotosForm();
    document.getElementById("form-title").textContent = "Nova ordem de serviço";
    renderChecklist();
    renderMateriaisForm([]);
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
  document.getElementById("btn-export-csv")?.addEventListener("click", abrirModalExportarCsv);
  document.getElementById("btn-catalogo")?.addEventListener("click", abrirEditorCatalogo);
  document.getElementById("btn-pecas")?.addEventListener("click", abrirEditorPecas);
  document.getElementById("btn-import")?.addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file")?.addEventListener("change", onImportFileChange);

  document.getElementById("modal-close").addEventListener("click", fecharModal);
  document.querySelector("#modal-root .modal-backdrop")?.addEventListener("click", fecharModal);

  document.getElementById("footer-help-contato")?.addEventListener("click", abrirModalContatoOS);
  document.getElementById("footer-help-sobre")?.addEventListener("click", abrirModalSobrePainelOS);
  document.getElementById("footer-help-manual")?.addEventListener("click", abrirModalManualPainelOS);

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

  await load();
}

document.addEventListener("os-app-unlock", () => {
  iniciarPainel();
});

window.addEventListener("DOMContentLoaded", () => {
  preencherVersaoRodape();
  monitorarAtualizacaoServiceWorker();
  const shell = document.getElementById("app-shell");
  if (shell && !shell.hidden) iniciarPainel();
});

window.addEventListener("resize", () => {
  if (window.__osPainelIniciado) render();
});
