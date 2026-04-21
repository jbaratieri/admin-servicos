const API_URL = "https://script.google.com/macros/s/AKfycbxpyz5mKI6oej5f5umOrV-tkAvtumI5X8E-o9Hna8YP5ZR9l2iUZtJwaIqFy-Vmcfxw/exec";

const flow = [
  "entrada",
  "diagnostico",
  "orcamento",
  "em_andamento",
  "pronto",
  "entregue"
];

const SERVICOS = [
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

let editingId = null;
let servicos = [];
let currentStatusIndex = 0;
let valorManual = false;

const formContainer = document.getElementById("form-container");

function abrirForm() {
  formContainer.style.display = "block";
}

function fecharForm() {
  formContainer.style.display = "none";
}

function isMobile() {
  return window.innerWidth < 768;
}

/** Aceita prompt/teclado BR: "80", "80,50", "1.234,56", "R$ 100" */
function parseValorReais(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/\s/g, "").replace(/R\$\s?/gi, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}


function uid() {
  return "OS-" + Date.now().toString().slice(-5);
}

function mudarStatusDirecao(direcao) {
  currentStatusIndex += direcao;

  if (currentStatusIndex < 0) currentStatusIndex = 0;
  if (currentStatusIndex >= flow.length) currentStatusIndex = flow.length - 1;

  render();
}

// 🔹 RENDER CHECKLIST + EVENTO
function renderChecklist() {
  const container = document.getElementById("checklist-servicos");

  container.innerHTML = SERVICOS.map(s => `
  <label class="check-item">
    <input type="checkbox" value="${s.nome}" class="check-input">
    <span class="check-label" title="${s.desc || ''}">
      ${s.nome} (R$ ${s.preco})
    </span>
  </label>
`).join("");

  // 🔥 evento automático de soma
  container.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", calcularTotalChecklist);
  });
}

// 🔹 calcular total automaticamente
function calcularTotalChecklist() {
  if (valorManual) return;
  const campo = document.getElementById("orcamento");
  const checks = document.querySelectorAll("#checklist-servicos input:checked");

  let total = 0;

  checks.forEach(c => {
    const serv = SERVICOS.find(s => s.nome === c.value);
    if (serv) total += serv.preco;
  });

  // ➕ extra
  const extra = Number(document.getElementById("extraValor").value) || 0;

  // ➖ desconto
  const desconto = Number(document.getElementById("desconto").value) || 0;


  total = total + extra - desconto;

  campo.value = total > 0 ? total : 0;
}

// 🔹 marcar serviços ao editar
function preencherChecklistSelecionado(lista) {
  const inputs = document.querySelectorAll("#checklist-servicos input");

  inputs.forEach(input => {
    input.checked = lista?.includes(input.value) || false;
  });
}

// 🔹 detectar edição manual
document.getElementById("orcamento").addEventListener("input", (e) => {
  if (e.isTrusted) { // 🔥 só usuário real
    valorManual = true;
  }
});

document.getElementById("extraValor").addEventListener("input", calcularTotalChecklist);
document.getElementById("desconto").addEventListener("input", calcularTotalChecklist);

window.addEventListener("DOMContentLoaded", () => {
  renderChecklist();
  const fab = document.getElementById("fab");
  if (fab) {
    fab.onclick = abrirForm;
  }
});

/** Planilha/API às vezes grava pagamentos como texto JSON ou vem vazio */
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

// 🔹 carregar dados
async function load() {
  const res = await fetch(API_URL);
  servicos = await res.json();
  if (!Array.isArray(servicos)) {
    servicos = [];
  }
  servicos.forEach(garantirArrayPagamentos);
  render();
}

// 🔹 salvar dados
async function save() {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(servicos)
  });
  if (!res.ok) {
    throw new Error("Falha ao salvar (" + res.status + ")");
  }
}

function corStatus(status) {
  switch (status) {
    case "entrada": return "#999";
    case "diagnostico": return "#f39c12";
    case "orcamento": return "#3498db";
    case "em_andamento": return "#9b59b6";
    case "pronto": return "#27ae60";
    case "entregue": return "#2c3e50";
    default: return "#ccc";
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

  // 🔥 atualiza na hora (sem delay)
  render();

  try {
    await save();
  } catch (e) {
    alert("Erro ao salvar");
    await load(); // restaura se der erro
  }
}

function renderCard(s, statusColuna = null) {

  const base = (s.orcamento || 0)
    - (Number(s.extraValor) || 0)
    + (Number(s.desconto) || 0);

  const total = Number(s.orcamento) || 0;
  const recebido = (s.pagamentos || []).reduce((soma, p) => soma + (Number(p.valor) || 0), 0);
  const restante = total - recebido;
  const pago = restante <= 0 && total > 0;
  const progresso = total > 0 ? (recebido / total) * 100 : 0;
  const mostrarFinanceiro = total > 0 || recebido > 0;

  return `
    <div class="card" ${statusColuna ? `style="border-left:5px solid ${corStatus(statusColuna)}"` : ""}>

      <div class="card-header">
  <div>
    <strong class="cliente">${s.cliente}</strong>
    <span class="instrumento">${s.instrumento}</span>
  </div>

  <div class="data">
    ${formatarData(s.data)}
  </div>
</div>

      ${(s.servicos?.length || s.extraNome) ? `
        <div class="card-servicos">

          ${s.servicos?.length ? `
            <div class="servico-bloco">
              <div class="servico-header">
                <span>Serviços</span>
                ${base ? `<span class="servico-valor">R$ ${base}</span>` : ""}
              </div>

              <div class="servico-tags">
                ${s.servicos.map(serv => `
                  <span class="tag-servico">${serv}</span>
                `).join("")}
              </div>
            </div>
          ` : ""}

          ${s.extraNome ? `
            <div class="extra-bloco">
              <div class="servico-header">
                <span>Extra</span>
                ${s.extraValor ? `<span class="servico-valor">R$ ${s.extraValor}</span>` : ""}
              </div>

              <span class="tag-servico tag-extra">${s.extraNome}</span>
            </div>
          ` : ""}

        </div>
      ` : ""}

      ${mostrarFinanceiro ? `
        <div class="financeiro">

          ${s.desconto ? `<div class="desconto">- Desconto: R$ ${s.desconto}</div>` : ""}

          <div class="total">Total: ${total > 0 ? `R$ ${total}` : `<span class="sem-orcamento">— defina no ✏️</span>`}</div>

          ${s.pagamentos?.length ? `
  <div class="pagamentos">
    ${s.pagamentos.map((p, i) => `
    <div class="pagamento-item">
  <div class="pagamento-info">
    💵 
    <span class="pagamento-valor">R$ ${p.valor}</span>
    <span class="data-pagamento">${formatarData(p.data)}</span>
  </div>

  <div class="pagamento-acoes">
    <button type="button" class="btn-editar-pag" onclick="editarPagamento('${s.id}', ${i})" title="Alterar valor">✏️</button>
    <button type="button" class="btn-remover" onclick="removerPagamento('${s.id}', ${i})" title="Excluir pagamento">✕</button>
  </div>
</div>
    `).join("")}
  </div>
` : ""}

          ${total > 0
        ? (pago
          ? `<div class="pago-ok">✔ Pago completo</div>`
          : `<div class="falta">Falta: R$ ${restante}</div>`)
        : (recebido > 0 ? `<div class="falta">Recebido (sem total no OS): R$ ${recebido}</div>` : "")
      }

          <div class="barra">
            <div class="barra-fill" style="width:${progresso}%"></div>
          </div>

        </div>
      ` : ""}

      <div class="card-footer">
        <div class="card-actions">
          <button onclick="abrirWhatsApp('${s.telefone}', '${s.cliente}', '${s.status}', '${s.orcamento}')">📲</button>
          <button onclick="editar('${s.id}')">✏️</button>
          <button onclick="avancarStatus('${s.id}')">➡️</button>
          <button onclick="abrirPagamento('${s.id}')">💵</button>
          <button onclick="excluirServico('${s.id}')">🗑️</button>
        </div>
      </div>

    </div>
  `;
}

function renderKanban() {
  const kanban = document.getElementById("kanban");
  kanban.innerHTML = "";

  flow.forEach(statusColuna => {

    const coluna = document.createElement("div");
    coluna.className = "coluna";

    coluna.innerHTML = `<h3>${formatarStatus(statusColuna)}</h3>`;

    servicos
      .filter(s => !s.arquivado)
      .filter(s => (s.status || "entrada") === statusColuna)
      .forEach(s => {
        coluna.innerHTML += renderCard(s, statusColuna);
      });

    kanban.appendChild(coluna);
  });
}

function renderMobile() {

  currentStatusIndex = Math.max(0, Math.min(currentStatusIndex, flow.length - 1));
  const kanban = document.getElementById("kanban");

  kanban.innerHTML = "";

  const statusSelecionado = flow[currentStatusIndex];

  const titulo = document.createElement("h2");
  titulo.innerText = formatarStatus(statusSelecionado);
  titulo.style.textAlign = "center";
  titulo.style.margin = "10px 0";

  kanban.appendChild(titulo);

  const lista = document.createElement("div");

  servicos
    .filter(s => !s.arquivado)
    .filter(s => (s.status || "entrada") === statusSelecionado)
    .reverse()
    .forEach(s => {
      lista.innerHTML += renderCard(s);
    });

  kanban.appendChild(lista);
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

async function abrirPagamento(id) {
  const texto = prompt("Valor recebido (R$):\n(dica: pode usar vírgula, ex. 80,50)");
  if (texto === null) return;

  const valor = parseValorReais(texto);
  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Valor inválido. Use números como 100 ou 100,50");
    return;
  }

  const idx = servicos.findIndex(s => s.id === id);
  if (idx === -1) return;

  garantirArrayPagamentos(servicos[idx]);

  servicos[idx].pagamentos.push({
    valor,
    data: new Date().toISOString()
  });

  // 🔥 recalcular pagamento automático
  const total = Number(servicos[idx].orcamento) || 0;



  render();

  try {
    await save();
  } catch (e) {
    alert("Erro ao salvar pagamento");
    await load();
  }
}

async function editarPagamento(servicoId, indexPagamento) {
  const idx = servicos.findIndex(s => s.id === servicoId);
  if (idx === -1) return;

  garantirArrayPagamentos(servicos[idx]);
  const lista = servicos[idx].pagamentos;
  const atual = lista[indexPagamento];
  if (!atual) return;

  const texto = prompt("Novo valor (R$):", String(atual.valor));
  if (texto === null) return;

  const valor = parseValorReais(texto);
  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Valor inválido. Use números como 100 ou 100,50");
    return;
  }

  servicos[idx].pagamentos[indexPagamento] = {
    ...atual,
    valor
  };

  render();

  try {
    await save();
  } catch (e) {
    alert("Erro ao salvar");
    await load();
  }
}

async function removerPagamento(servicoId, indexPagamento) {

  const confirmar = confirm("Remover este pagamento?");
  if (!confirmar) return;

  const idx = servicos.findIndex(s => s.id === servicoId);
  if (idx === -1) return;

  garantirArrayPagamentos(servicos[idx]);
  servicos[idx].pagamentos.splice(indexPagamento, 1);

  render();

  try {
    await save();
  } catch (e) {
    alert("Erro ao salvar");
    await load();
  }
}

async function excluirServico(id) {
  const servico = servicos.find(s => s.id === id);
  if (!servico) return;

  garantirArrayPagamentos(servico);

  // 🚫 bloqueios de segurança
  if (servico.status === "entregue") {
    alert("Serviços já entregues não podem ser excluídos.");
    return;
  }

  const total = Number(servico.orcamento) || 0;
  const recebido = servico.pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  if (recebido >= total && total > 0) {
    alert("Serviços pagos não podem ser excluídos.");
    return;
  }

  const confirmar = confirm("Excluir este serviço?");
  if (!confirmar) return;

  // remove e atualiza tela
  servicos = servicos.filter(s => s.id !== id);
  render();

  try {
    await save();
  } catch (e) {
    alert("Erro ao excluir");
    await load(); // restaura se der erro
  }
}

async function arquivarServico(id) {
  const idx = servicos.findIndex(s => s.id === id);

  if (idx === -1) return;

  servicos[idx].arquivado = true;

  // 🔥 some na hora
  render();

  try {
    await save();
  } catch (e) {
    alert("Erro ao salvar");
    await load();
  }
}

function verArquivados() {
  const kanban = document.getElementById("kanban");

  const arquivados = servicos.filter(s => s.arquivado);

  kanban.innerHTML = `
  <div class="topo-arquivados">
    <button class="btn-voltar" onclick="render()">← Voltar</button>
    <h2>📦 Arquivados</h2>
  </div>


    ${arquivados.length === 0 ? "<p>Nenhum serviço arquivado.</p>" : ""}

    ${arquivados.map(s => `
      <div class="card">
        <b>${s.cliente}</b><br>
        ${s.instrumento}<br>
        ${s.orcamento ? `
  <div class="valor">
    R$ ${s.orcamento}
  </div>
` : ""}
        <small>${formatarStatus(s.status)}</small>
      </div>
    `).join("")}
  `;
}

function abrirWhatsApp(telefone, nome, status, valor) {
  const url = gerarLinkWhatsApp(telefone, nome, status, valor);
  if (url !== "#") {
    window.open(url, "_blank");
  }
}

function gerarLinkWhatsApp(telefone, nome, status, valor) {
  if (!telefone) return "#";

  const numero = telefone.replace(/\D/g, "");
  const v = valor || "0";

  let mensagem = "";

  switch (status) {
    case "orcamento":
      mensagem = `Olá ${nome}, seu orçamento ficou em R$ ${v}. Podemos prosseguir?`;
      break;
    case "pronto":
      mensagem = `Olá ${nome}, seu instrumento está pronto 🎸 Valor: R$ ${v}`;
      break;
    default:
      mensagem = `Olá ${nome}`;
  }

  return `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`;
}

function formatarStatus(status) {
  return status.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
}

function render() {
  if (isMobile()) {
    renderMobile();
  } else {
    renderKanban();
  }
}

// ✏️ EDITAR (AGORA COM CHECKLIST CORRETO)
function editar(id) {
  const s = servicos.find(x => x.id === id);

  document.getElementById("cliente").value = s.cliente || "";
  document.getElementById("telefone").value = s.telefone || "";
  document.getElementById("instrumento").value = s.instrumento || "";
  document.getElementById("problema").value = s.problema || "";
  document.getElementById("orcamento").value = s.orcamento || "";
  document.getElementById("pagamento").value = s.pagamento || "pendente";

  // ✅ NOVOS CAMPOS
  document.getElementById("extraNome").value = s.extraNome || "";
  document.getElementById("extraValor").value = s.extraValor || "";
  document.getElementById("desconto").value = s.desconto || "";

  // checklist
  preencherChecklistSelecionado(s.servicos);

  // 🔥 AQUI ESTÁ O SEGREDO
  preencherChecklistSelecionado(s.servicos);

  valorManual = false;
  document.getElementById("orcamento").dataset.manual = "false";

  editingId = id;

  abrirForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 🧾 SALVAR
document.getElementById("form").addEventListener("submit", async e => {
  e.preventDefault();



  const checks = document.querySelectorAll("#checklist-servicos input:checked");
  const servicosSelecionados = Array.from(checks).map(c => c.value);

  let valorTotal = 0;

  servicosSelecionados.forEach(nome => {
    const serv = SERVICOS.find(s => s.nome === nome);
    if (serv) valorTotal += serv.preco;
  });

  const extra = Number(document.getElementById("extraValor").value) || 0;
  const desconto = Number(document.getElementById("desconto").value) || 0;

  const valorFinal = valorManual
    ? Number(document.getElementById("orcamento").value)
    : (valorTotal + extra - desconto);

  if (editingId) {
    const idx = servicos.findIndex(s => s.id === editingId);

    servicos[idx] = {
      ...servicos[idx],
      cliente: document.getElementById("cliente").value,
      telefone: document.getElementById("telefone").value,
      instrumento: document.getElementById("instrumento").value,
      problema: document.getElementById("problema").value,
      servicos: servicosSelecionados,
      orcamento: valorFinal,
      extraNome: document.getElementById("extraNome").value,
      extraValor: extra,
      desconto: desconto,

    };

    editingId = null;

  } else {
    const novo = {
      id: uid(),
      cliente: document.getElementById("cliente").value,
      telefone: document.getElementById("telefone").value,
      instrumento: document.getElementById("instrumento").value,
      problema: document.getElementById("problema").value,
      servicos: servicosSelecionados,
      status: "entrada",
      orcamento: valorFinal,

      // 🔥 FALTAVAM ESSES
      extraNome: document.getElementById("extraNome").value,
      extraValor: extra,
      desconto: desconto,

      pagamentos: [],
      data: new Date().toISOString()
    };


    servicos.push(novo);
  }



  valorManual = false;

  const btn = e.target.querySelector("button[type='submit']");

  btn.innerText = "Salvando...";
  btn.disabled = true;

  await save();
  await load(); // 🔥 espera tudo terminar antes

  btn.innerText = "Salvo!";

  setTimeout(() => {
    btn.disabled = false;
    btn.innerText = "Salvar";
  }, 800);

  e.target.reset();
  fecharForm();
  window.scrollTo({ top: 0, behavior: "smooth" });

});

let startX = 0;
let endX = 0;
let isSwiping = false;

document.addEventListener("touchstart", e => {
  // ❌ ignorar cliques em botões/links
  if (e.target.closest("button, a")) return;

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
    if (diff > 0) {
      mudarStatusDirecao(-1);
    } else {
      mudarStatusDirecao(1);
    }
  }

  isSwiping = false;
  startX = 0;
  endX = 0;
});

// 🚀 iniciar
load();