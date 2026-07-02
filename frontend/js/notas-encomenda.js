const utilizadorId = localStorage.getItem("id");

const nome = localStorage.getItem("nome");
const perfil = localStorage.getItem("perfil");

document.getElementById("userName").textContent = nome || "Utilizador";
document.getElementById("userRole").textContent = perfil || "";

const logoutBtn = document.getElementById("logoutBtn");

async function carregarContratos() {
  const resposta = await fetch(
    `http://localhost:3000/api/gestor/contratos?utilizadorId=${utilizadorId}`
  );

  const contratos = await resposta.json();
  const select = document.getElementById("contratoSelect");

  select.innerHTML = "";

  contratos.forEach(c => {
    select.innerHTML += `
      <option value="${c.CentroCusto}">
        ${c.NomeContrato} - ${c.CentroCusto}
      </option>
    `;
  });
}

function carregarPeriodos() {
  const anoSelect = document.getElementById("anoSelect");
  const mesSelect = document.getElementById("mesSelect");

  anoSelect.innerHTML = `
    <option value="2026">2026</option>
    <option value="2025">2025</option>
  `;

  mesSelect.innerHTML = "";

  for (let mes = 1; mes <= 12; mes++) {
    mesSelect.innerHTML += `
      <option value="${mes}">
        ${String(mes).padStart(2, "0")}
      </option>
    `;
  }
}

async function pesquisarNotas() {
  const centroCusto = document.getElementById("contratoSelect").value;
  const ano = document.getElementById("anoSelect").value;
  const mes = document.getElementById("mesSelect").value;
  const estado = document.getElementById("estadoSelect").value;

  const resposta = await fetch(
    `http://localhost:3000/api/gestor/notas-encomenda?utilizadorId=${utilizadorId}&centroCusto=${centroCusto}&ano=${ano}&mes=${mes}`
  );

  let notas = await resposta.json();

  if (estado) {
    notas = notas.filter(n => obterEstadoNota(n) === estado);
  }

  const container = document.getElementById("listaNotas");
  container.innerHTML = "";

  if (!notas.length) {
    container.innerHTML = "<p>Não existem notas de encomenda para os filtros selecionados.</p>";
    return;
  }

  notas.forEach(n => {
    const estadoNota = obterEstadoNota(n);

    container.innerHTML += `
      <div class="analise-card-wide">
        <div>
          <div class="movimento-tags">
            <span class="tag ${obterClasseEstado(estadoNota)}">
              ${formatarEstado(estadoNota)}
            </span>
          </div>

          <h3>${n.DescricaoPedido || "Nota de Encomenda"}</h3>
          <p>Documento Compra: ${n.DocumentoCompra || "-"}</p>
          <p>Fornecedor: ${n.NomeFornecedor || "-"}</p>
          <p>Data: ${formatarData(n.DataCriacaoItem)}</p>
        </div>

        <div class="analise-status-area">
          <p>Valor Pedido</p>
          <strong>${formatarNumero(n.ValorPedido)} €</strong>
          <p>Valor Faturado</p>
          <strong>${formatarNumero(n.ValorFaturado)} €</strong>
        </div>
      </div>
    `;
  });
}

function obterEstadoNota(nota) {
  const pedido = Number(nota.ValorPedido || 0);
  const faturado = Number(nota.ValorFaturado || 0);

  if (faturado === 0) return "POR_FATURAR";
  if (faturado < pedido) return "PARCIAL";
  return "FATURADO";
}

function formatarEstado(estado) {
  if (estado === "POR_FATURAR") return "Por faturar";
  if (estado === "PARCIAL") return "Parcialmente faturado";
  if (estado === "FATURADO") return "Faturado";
  return "Sem estado";
}

function obterClasseEstado(estado) {
  if (estado === "POR_FATURAR") return "tag-custo";
  if (estado === "PARCIAL") return "tag-sem-classificacao";
  if (estado === "FATURADO") return "tag-proveito";
  return "tag-grupo";
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-PT");
}

function formatarNumero(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

document.getElementById("pesquisarBtn").addEventListener("click", pesquisarNotas);

carregarContratos();
carregarPeriodos();