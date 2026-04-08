const API_URL = "https://script.google.com/macros/s/AKfycbxpyz5mKI6oej5f5umOrV-tkAvtumI5X8E-o9Hna8YP5ZR9l2iUZtJwaIqFy-Vmcfxw/exec";

const flow = [
  "entrada",
  "diagnostico",
  "orcamento",
  "em_andamento",
  "pronto",
  "entregue"
];

let editingId = null;
let servicos = [];

function isMobile() {
  return true;
}

// 🔹 gerar ID
function uid() {
  return "OS-" + Date.now().toString().slice(-5);
}

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

// 🎨 cor por status
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

// 🔁 próximo status
function nextStatus(current) {
  const idx = flow.indexOf(current);
  return flow[idx + 1] || current;
}

// 🚀 avançar status
async function avancarStatus(id) {
  const idx = servicos.findIndex(s => s.id === id);

  const atual = servicos[idx].status || "entrada";
  servicos[idx].status = nextStatus(atual);

  await save();
  render();
}

// 💰 alternar pagamento
async function togglePagamento(id) {
  const idx = servicos.findIndex(s => s.id === id);

  const atual = servicos[idx].pagamento || "pendente";
  servicos[idx].pagamento = atual === "pago" ? "pendente" : "pago";

  await save();
  render();
}

// 📲 WhatsApp
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

// 🔤 formatar nome do status
function formatarStatus(status) {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

function render() {
  if (isMobile()) {
    renderMobile();
  } else {
    renderKanban();
  }
}


// 🧠 renderizar kanban
function renderKanban() {
  const kanban = document.getElementById("kanban");
  kanban.innerHTML = "";

  flow.forEach(statusColuna => {

    const coluna = document.createElement("div");
    coluna.className = "coluna";

    coluna.innerHTML = `<h3>${formatarStatus(statusColuna)}</h3>`;

    servicos
      .filter(s => (s.status || "entrada") === statusColuna)
      .forEach(s => {

        const pagamento = s.pagamento || "pendente";

        const div = document.createElement("div");
        div.className = "card";

        div.style.borderLeft = `5px solid ${corStatus(statusColuna)}`;

        div.innerHTML = `
          <b>${s.cliente}</b><br>
          ${s.instrumento}<br>
          <small>${s.problema}</small><br>

          ${s.orcamento ? `<strong>R$ ${s.orcamento}</strong><br>` : ""}

          <small style="color:${pagamento === "pago" ? "green" : "red"}">
            ${pagamento === "pago" ? "Pago" : "Pendente"}
          </small><br>

          <button onclick="togglePagamento('${s.id}')">💰</button>

          <a href="${gerarLinkWhatsApp(s.telefone, s.cliente, s.status, s.orcamento)}" target="_blank">
            📲
          </a>

          <button onclick="editar('${s.id}')">✏️</button>
          <button onclick="avancarStatus('${s.id}')">➡️</button>
        `;

        coluna.appendChild(div);
      });

    kanban.appendChild(coluna);
  });
}

function renderMobile() {
  const kanban = document.getElementById("kanban");
  kanban.innerHTML = "";

  const statusSelecionado = document.getElementById("filtroStatus")?.value || "entrada";

  const lista = document.createElement("div");

  servicos
    .filter(s => (s.status || "entrada") === statusSelecionado)
    .reverse()
    .forEach(s => {

      const pagamento = s.pagamento || "pendente";

      const div = document.createElement("div");
      div.className = "card";

      div.innerHTML = `
        <b>${s.cliente}</b><br>
        ${s.instrumento}<br>
        <small>${s.problema}</small><br>

        ${s.orcamento ? `<strong>R$ ${s.orcamento}</strong><br>` : ""}

        <small style="color:${pagamento === "pago" ? "green" : "red"}">
          ${pagamento === "pago" ? "Pago" : "Pendente"}
        </small><br><br>

        <button onclick="togglePagamento('${s.id}')">💰</button>
        <a href="${gerarLinkWhatsApp(s.telefone, s.cliente, s.status, s.orcamento)}" target="_blank">📲</a>
        <button onclick="editar('${s.id}')">✏️</button>
        <button onclick="avancarStatus('${s.id}')">➡️</button>
      `;

      lista.appendChild(div);
    });

  kanban.appendChild(lista);
}

// ✏️ editar
function editar(id) {
  const s = servicos.find(x => x.id === id);

  cliente.value = s.cliente;
  telefone.value = s.telefone;
  instrumento.value = s.instrumento;
  problema.value = s.problema;
  status.value = s.status || "entrada";
  orcamento.value = s.orcamento || "";
  pagamento.value = s.pagamento || "pendente";

  editingId = id;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 🧾 salvar formulário
document.getElementById("form").addEventListener("submit", async e => {
  e.preventDefault();

  if (editingId) {
    const idx = servicos.findIndex(s => s.id === editingId);

    servicos[idx] = {
      ...servicos[idx],
      cliente: cliente.value,
      telefone: telefone.value,
      instrumento: instrumento.value,
      problema: problema.value,
      status: status.value,
      orcamento: orcamento.value,
      pagamento: pagamento.value
    };

    editingId = null;

  } else {
    const novo = {
      id: uid(),
      cliente: cliente.value,
      telefone: telefone.value,
      instrumento: instrumento.value,
      problema: problema.value,
      status: "entrada",
      orcamento: orcamento.value || "",
      pagamento: pagamento.value || "pendente",
      data: new Date().toISOString()
    };

    servicos.push(novo);
  }

  await save();
  load();
  e.target.reset();
});



// 🚀 iniciar
load();