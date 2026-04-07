const API_URL = "https://script.google.com/macros/s/AKfycbxpyz5mKI6oej5f5umOrV-tkAvtumI5X8E-o9Hna8YP5ZR9l2iUZtJwaIqFy-Vmcfxw/exec";

let editingId = null;
let servicos = [];

function uid() {
  return "OS-" + Date.now().toString().slice(-5);
}

async function load() {
  const res = await fetch(API_URL);
  servicos = await res.json();
  render();
}

async function save() {
  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(servicos)
  });
}

function render() {
  const lista = document.getElementById("lista");
  const status = s.status || "entrada";
  lista.innerHTML = "";

  servicos.slice().reverse().forEach(s => {

    const div = document.createElement("div"); // 👈 FALTAVA ISSO
    div.className = "card";

    div.innerHTML = `
      <b>${s.cliente}</b> (${s.instrumento})<br>
      ${s.problema}<br>
      <small>Status: ${s.status}</small><br>

      <button onclick="editar('${s.id}')">Editar</button>
    `;

    lista.appendChild(div);
  });
}

function editar(id) {
  const s = servicos.find(x => x.id === id);

  cliente.value = s.cliente;
  telefone.value = s.telefone;
  instrumento.value = s.instrumento;
  problema.value = s.problema;
  status.value = s.status;

  editingId = id;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

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
      status: status.value
    };

    editingId = null;

  } else {
    const novo = {
  id: uid(),
  cliente: cliente.value,
  telefone: telefone.value,
  instrumento: instrumento.value,
  problema: problema.value,
  status: "entrada", // 👈 NOVO
  data: new Date().toISOString()
};

    servicos.push(novo);
  }

  await save();
  load();
  e.target.reset();
});

load();