const nome = localStorage.getItem("nome");
const perfil = localStorage.getItem("perfil");
const utilizadorId = localStorage.getItem("id");

document.getElementById("userName").textContent = nome || "Utilizador";
document.getElementById("userRole").textContent = perfil || "";

const params = new URLSearchParams(window.location.search);
const analiseId = params.get("analiseId");

carregarControloEconomico();

async function carregarControloEconomico() {
  const resposta = await fetch(
    `http://localhost:3000/api/gestor/controlo-economico?utilizadorId=${utilizadorId}&analiseId=${analiseId}`
  );

  const dados = await resposta.json();

  if (!dados.success) {
    alert(dados.message || "Erro ao carregar controlo económico.");
    return;
  }

  preencherCabecalho(dados.analise);

  const sap = [
    ...dados.sapFixos,
    ...dados.sapVariaveis
  ];

  const acumulados = [
    ...dados.acumuladosFixos,
    ...dados.acumuladosVariaveis
  ];

  preencherLista("listaSAPReal", sap);
  preencherLista("listaAcumuladosAntecipados", acumulados);

  const total = sap.reduce((s, m) => s + Number(m.ValorMR || 0), 0);
  document.getElementById("totalRealResumo").textContent = `${formatarNumero(total)} €`;
}

function preencherCabecalho(analise) {

  document.getElementById("subtituloAnalise").textContent =
    `${analise.NomeContrato} - ${analise.CentroCusto}`;

  document.getElementById("centroCustoResumo").textContent =
  analise.CentroCusto || "-";

  document.getElementById("descricaoResumo").textContent =
    analise.Descricao || "-";

  document.getElementById("responsavelResumo").textContent =
    analise.Responsavel || "-";

  document.getElementById("periodoResumo").textContent =
    `${String(analise.Mes).padStart(2, "0")}/${analise.Ano}`;
  }

function preencherLista(idContainer, movimentos) {
  const container = document.getElementById(idContainer);
  container.innerHTML = "";

  if (!movimentos || movimentos.length === 0) {
    container.innerHTML = "<p>Não existem movimentos.</p>";
    return;
  }

  movimentos.forEach(m => {
    container.innerHTML += `
      <div class="analise-card-wide">
        <div>
          <div class="movimento-tags">
            <span class="tag ${obterNatureza(m) === "Custo" ? "tag-custo" : "tag-proveito"}">
              ${obterNatureza(m)}
            </span>

            <span class="tag tag-grupo">
              ${m.CodigoGrupo || "--"} ${m.GrupoConta || "Sem grupo"}
            </span>

            <span class="tag ${m.Tipo === "FIXO" ? "tag-fixo" : "tag-variavel"}">
              ${m.Tipo === "FIXO" ? "Fixo" : "Variável"}
            </span>

            ${m.ValorAntecipado ? `<span class="tag tag-antecipado">Valor antecipado</span>` : ""}
          </div>

          <h3>${m.TextoCabecalhoDocumento || m.DescricaoClasseCusto || "Movimento contabilístico"}</h3>
          <p>Documento contabilístico: ${m.NumeroDocumentoReferencia || "-"}</p>
          <p>Conta contabilística: ${m.ClasseCusto || "-"}</p>

          ${
            m.ValorAntecipado
              ? `<p>Regularização prevista: ${String(m.MesRegularizacao).padStart(2, "0")}/${m.AnoRegularizacao}</p>`
              : ""
          }

          ${m.Comentario ? `<p>Comentário: ${m.Comentario}</p>` : ""}
        </div>

        <div class="analise-status-area">
          <strong>${formatarNumero(m.ValorMR)} ${m.MoedaRelatorio || "EUR"}</strong>
        </div>
      </div>
    `;
  });
}

function obterNatureza(m) {
  if (m.TipoProveito && !m.TipoCusto) return "Proveito";
  if (m.TipoCusto && !m.TipoProveito) return "Custo";

  if (m.TipoCusto && m.TipoProveito) {
    return Number(m.ValorMR) >= 0 ? "Proveito" : "Custo";
  }

  return "Sem classificação";
}

function abrirSAP() {
  window.location.href = `analise-economica.html?analiseId=${analiseId}`;
}

function abrirValoresEmFalta() {
  window.location.href = `valores-em-falta.html?analiseId=${analiseId}`;
}

function formatarNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}