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
  { nome: "Regulagem geral", preco: 150 },
  { nome: "Troca de cordas", preco: 40 },
  { nome: "Ajuste de tensor", preco: 80 },
  { nome: "Nivelamento de trastes", preco: 250 },
  { nome: "Polimento de trastes", preco: 120 },
  { nome: "Colagem de cavalete", preco: 180 },
  { nome: "Colagem de trinca", preco: 200 },
  { nome: "Troca de pestana", preco: 100 },
  { nome: "Hidratação da escala", preco: 60 },
  { nome: "Limpeza geral", preco: 50 }
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
  <label style="
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:6px;
    cursor:pointer;
  ">
    <input type="checkbox" value="${s.nome}" style="margin:0;">
    <span>${s.nome} (R$ ${s.preco})</span>
  </label>
`).join("");

  // 🔥 evento automático de soma
  container.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", calcularTotalChecklist);
  });
}

// 🔹 calcular total automaticamente
function calcularTotalChecklist() {
  const campo = document.getElementById("orcamento");

  // 👉 só bloqueia se usuário digitou algo DIFERENTE do automático
  if (valorManual && campo.dataset.manual === "true") return;

}

const checks = document.querySelectorAll("#checklist-servicos input:checked");

let total = 0;

checks.forEach(c => {
  const serv = SERVICOS.find(s => s.nome === c.value);
  if (serv) total += serv.preco;
});

document.getElementById("orcamento").value = total;


// 🔹 marcar serviços ao editar
function preencherChecklistSelecionado(lista) {
  const inputs = document.querySelectorAll("#checklist-servicos input");

  inputs.forEach(input => {
    input.checked = lista?.includes(input.value) || false;
  });
}

// 🔹 detectar edição manual
document.getElementById("orcamento").addEventListener("input", (e) => {
  valorManual = true;
  e.target.dataset.manual = "true";
});

window.addEventListener("DOMContentLoaded", () => {
  renderChecklist();
  const fab = document.getElementById("fab");
  if (fab) {
    fab.onclick = abrirForm;
  }
});

// 🔹 carregar dados
async function load() {
  const res = await fetch(API_URL);
  servicos = await res.json();
  render();
}

// 🔹 salvar dados
async function save() {
  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(servicos)
  });
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

        const pagamento = s.pagamento || "pendente";

        const div = document.createElement("div");
        div.className = "card";

        div.style.borderLeft = `5px solid ${corStatus(statusColuna)}`;

        div.innerHTML = `
          <b>${s.cliente}</b><br>
          ${s.instrumento}<br>

          ${s.servicos?.length ? `
            <div style="margin:6px 0; display:flex; flex-wrap:wrap; gap:4px;">
              ${s.servicos.map(serv => `
                <span style="font-size:11px;background:#f1f1f1;padding:4px 6px;border-radius:6px;">
                  ${serv}
                </span>
              `).join("")}
            </div>
          ` : ""}

          ${s.orcamento ? `<strong>R$ ${s.orcamento}</strong><br>` : ""}

          <small style="color:${pagamento === "pago" ? "green" : "red"}">
            ${pagamento === "pago" ? "Pago" : "Pendente"}
          </small><br>

          <button onclick="togglePagamento('${s.id}')">💰</button>
          <button onclick="abrirWhatsApp('${s.telefone}', '${s.cliente}', '${s.status}', '${s.orcamento}')">
  📲</button>
          <button onclick="editar('${s.id}')">✏️</button>
          <button onclick="avancarStatus('${s.id}')">➡️</button>
          ${s.status !== "entregue" && s.pagamento !== "pago" ? `
          <button onclick="excluirServico('${s.id}')">🗑️</button>
` : ""}
          ${s.status === "entregue" ? `
          <button onclick="arquivarServico('${s.id}')">📦</button>
` : ""}
        `;

        coluna.appendChild(div);
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

      const pagamento = s.pagamento || "pendente";

      const div = document.createElement("div");
      div.className = "card";

      div.innerHTML = `
        <b>${s.cliente}</b><br>
        ${s.instrumento}<br>

        ${s.servicos?.length ? `
          <div style="margin:6px 0; display:flex; flex-wrap:wrap; gap:4px;">
            ${s.servicos.map(serv => `
              <span style="font-size:11px;background:#f1f1f1;padding:4px 6px;border-radius:6px;">
                ${serv}
              </span>
            `).join("")}
          </div>
        ` : ""}

        ${s.orcamento ? `<strong>R$ ${s.orcamento}</strong><br>` : ""}

        <small style="color:${pagamento === "pago" ? "green" : "red"}">
          ${pagamento === "pago" ? "Pago" : "Pendente"}
        </small><br>

        <button onclick="togglePagamento('${s.id}')">💰</button>
        <button onclick="abrirWhatsApp('${s.telefone}', '${s.cliente}', '${s.status}', '${s.orcamento}')">
  📲</button>
        <button onclick="editar('${s.id}')">✏️</button>
        <button onclick="avancarStatus('${s.id}')">➡️</button>
        ${s.status !== "entregue" && s.pagamento !== "pago" ? `
        <button onclick="excluirServico('${s.id}')">🗑️</button>
` : ""}
        ${s.status === "entregue" ? `
        <button onclick="arquivarServico('${s.id}')">📦</button>
` : ""}
      `;

      lista.appendChild(div);
    });

  kanban.appendChild(lista);
}

async function togglePagamento(id) {
  const idx = servicos.findIndex(s => s.id === id);

  if (idx === -1) return;

  const atual = servicos[idx].pagamento || "pendente";
  servicos[idx].pagamento = atual === "pago" ? "pendente" : "pago";

  // 🔥 instantâneo
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

  // 🚫 bloqueios de segurança
  if (servico?.status === "entregue") {
    alert("Serviços já entregues não podem ser excluídos.");
    return;
  }

  if (servico?.pagamento === "pago") {
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
        ${s.orcamento ? `<strong>R$ ${s.orcamento}</strong><br>` : ""}
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

  const valorFinal = valorManual
    ? document.getElementById("orcamento").value
    : valorTotal;

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
      pagamento: document.getElementById("pagamento").value
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
      pagamento: document.getElementById("pagamento").value || "pendente",
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