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

async function pesquisarMovimentos() {
  const centroCusto = document.getElementById("contratoSelect").value;
  const ano = document.getElementById("anoSelect").value;
  const mes = document.getElementById("mesSelect").value;
  const tipo = document.getElementById("tipoSelect").value;
  const grupo = document.getElementById("grupoSelect").value;

  const resposta = await fetch(
    `http://localhost:3000/api/gestor/movimentos?utilizadorId=${utilizadorId}&centroCusto=${centroCusto}&ano=${ano}&mes=${mes}&tipo=${tipo}&grupo=${grupo}`
  );

  const movimentos = await resposta.json();
  const container = document.getElementById("listaMovimentos");

  container.innerHTML = "";

  if (!movimentos.length) {
    container.innerHTML = "<p>Não existem movimentos para os filtros selecionados.</p>";
    return;
  }

  movimentos.forEach(m => {
    container.innerHTML += `
      <div class="analise-card-wide">
        <div>
          <div class="movimento-tags">
            <span class="tag ${m.TipoMovimento === "CUSTO" ? "tag-custo" : m.TipoMovimento === "PROVEITO" ? "tag-proveito" : "tag-sem-classificacao"}">
              ${formatarTipo(m.TipoMovimento)}
            </span>

            <span class="tag tag-grupo">
              ${m.CodigoGrupo || "--"} ${m.GrupoConta || "Sem grupo"}
            </span>
          </div>

          <h3>${m.DescricaoClasseCusto || "Movimento contabilístico"}</h3>
          <p>Documento: ${m.NumeroDocumentoReferencia || "-"}</p>
          <p>Classe de Custo: ${m.ClasseCusto || "-"}</p>
          <p>Data: ${formatarData(m.DataDocumento)}</p>
        </div>

        <div class="analise-status-area">
          <strong>${formatarNumero(m.ValorMR)} ${m.MoedaRelatorio || ""}</strong>
        </div>
      </div>
    `;
  });
}

function formatarTipo(tipo) {
  if (tipo === "CUSTO") return "Custo";
  if (tipo === "PROVEITO") return "Proveito";
  return "Sem classificação";
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

document.getElementById("pesquisarBtn").addEventListener("click", pesquisarMovimentos);

carregarContratos();
carregarPeriodos();