const nome = localStorage.getItem("nome");
const perfil = localStorage.getItem("perfil");

document.getElementById("userName").textContent = nome || "Utilizador";
document.getElementById("userRole").textContent = perfil || "";

let todosContratos = [];

async function carregarMeusContratos() {
  const utilizadorId = localStorage.getItem("id");

  const resposta = await fetch(
    `http://localhost:3000/api/gestor/meus-contratos?utilizadorId=${utilizadorId}`
  );

  todosContratos = await resposta.json();

  preencherFiltros(todosContratos);
  renderizarContratos(todosContratos);
}

function preencherFiltros(contratos) {
  const anoFiltro = document.getElementById("anoFiltro");
  const mesFiltro = document.getElementById("mesFiltro");

  const anos = [...new Set(contratos.map(c => c.Ano))].sort((a, b) => b - a);
  const meses = [...new Set(contratos.map(c => c.Mes))].sort((a, b) => a - b);

  anoFiltro.innerHTML = `<option value="">Todos os anos</option>`;
  mesFiltro.innerHTML = `<option value="">Todos os meses</option>`;

  anos.forEach(ano => {
    anoFiltro.innerHTML += `<option value="${ano}">${ano}</option>`;
  });

  meses.forEach(mes => {
    mesFiltro.innerHTML += `
      <option value="${mes}">
        ${String(mes).padStart(2, "0")}
      </option>
    `;
  });
}

function aplicarFiltros() {
  const ano = document.getElementById("anoFiltro").value;
  const mes = document.getElementById("mesFiltro").value;
  const pesquisa = document
    .getElementById("pesquisaContrato")
    .value
    .toLowerCase()
    .trim();

  let filtrados = todosContratos;

  if (ano) {
    filtrados = filtrados.filter(c => String(c.Ano) === ano);
  }

  if (mes) {
    filtrados = filtrados.filter(c => String(c.Mes) === mes);
  }

  if (pesquisa) {
    filtrados = filtrados.filter(c =>
      String(c.NomeContrato || "").toLowerCase().includes(pesquisa)
    );
  }

  renderizarContratos(filtrados);
}

function renderizarContratos(contratos) {
  const container = document.getElementById("historicoContratos");
  container.innerHTML = "";

  if (!contratos || contratos.length === 0) {
    container.innerHTML = "<p>Não existem contratos para apresentar.</p>";
    return;
  }

  const contratosPorAno = {};

  contratos.forEach(c => {
    if (!contratosPorAno[c.Ano]) {
      contratosPorAno[c.Ano] = [];
    }

    contratosPorAno[c.Ano].push(c);
  });

  Object.keys(contratosPorAno)
    .sort((a, b) => b - a)
    .forEach(ano => {
      container.innerHTML += `
        <div class="ano-section">
          <h2>${ano}</h2>
        </div>
      `;

      contratosPorAno[ano].forEach(c => {
        container.innerHTML += `
          <div class="analise-card-wide analise-historico">
            <div>
              <h3>${c.NomeContrato}</h3>
              <p>Centro de Custo: ${c.CentroCusto}</p>
              <p>Período: ${String(c.Mes).padStart(2, "0")}/${c.Ano}</p>

              <div class="analise-resumo">
                <div class="resumo-item">
                  <span>Custos</span>
                  <strong class="valor-custo">
                    ${formatarNumero(c.TotalCustos)} €
                  </strong>
                </div>

                <div class="resumo-item">
                  <span>Proveitos</span>
                  <strong class="valor-proveito">
                    ${formatarNumero(c.TotalProveitos)} €
                  </strong>
                </div>
              </div>
            </div>

            <div class="analise-status-area">
              <button onclick="abrirAnalise(${c.Id})">
                Consultar Análise
              </button>
            </div>
          </div>
        `;
      });
    });
}

function formatarNumero(valor) {
  if (valor === null || valor === undefined) return "0,00";

  return Number(valor).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function abrirAnalise(id) {
  window.location.href = `analise-economica.html?analiseId=${id}`;
}

document.getElementById("filtrarBtn").addEventListener("click", aplicarFiltros);
document.getElementById("pesquisaContrato").addEventListener("input", aplicarFiltros);
document.getElementById("anoFiltro").addEventListener("change", aplicarFiltros);
document.getElementById("mesFiltro").addEventListener("change", aplicarFiltros);

carregarMeusContratos();