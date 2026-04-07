const API_URL = "https://script.google.com/macros/s/AKfycbxpyz5mKI6oej5f5umOrV-tkAvtumI5X8E-o9Hna8YP5ZR9l2iUZtJwaIqFy-Vmcfxw/exec";

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
  lista.innerHTML = "";

  servicos.slice().reverse().forEach(s => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <b>${s.cliente}</b> (${s.instrumento})<br>
      ${s.problema}<br>
      <small>Status: ${s.status}</small>
    `;

    lista.appendChild(div);
  });
}

document.getElementById("form").addEventListener("submit", async e => {
  e.preventDefault();

  const novo = {
    id: uid(),
    cliente: cliente.value,
    telefone: telefone.value,
    instrumento: instrumento.value,
    problema: problema.value,
    status: status.value,
    data: new Date().toISOString()
  };

  servicos.push(novo);

  await save();
  load();
  e.target.reset();
});

load();