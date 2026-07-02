const nome = localStorage.getItem("nome");
const perfil = localStorage.getItem("perfil");
const utilizadorId = localStorage.getItem("id");

document.getElementById("userName").textContent = nome || "Utilizador";
document.getElementById("userRole").textContent = perfil || "";

const params = new URLSearchParams(window.location.search);
const analiseId = params.get("analiseId");

let analiseAtual = null;
let gruposConta = [];
let valoresEmFaltaAtuais = [];

carregarPagina();

async function carregarPagina() {
  await carregarAnalise();
  await carregarGruposConta();
  await carregarValoresEmFalta();
}

async function carregarAnalise() {
  const resposta = await fetch(
    `http://localhost:3000/api/gestor/analise-economica?utilizadorId=${utilizadorId}&analiseId=${analiseId}`
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    alert(dados.message || "Erro ao carregar análise.");
    return;
  }

  analiseAtual = dados.analise;

  document.getElementById("subtituloAnalise").textContent =
  `${analiseAtual.NomeContrato} - ${analiseAtual.CentroCusto}`;

  const a = dados.analise;

document.getElementById("subtituloAnalise").textContent =
    `${a.Descricao} - ${a.CentroCusto}`;

document.getElementById("centroCustoResumo").textContent =
    a.CentroCusto || "-";

document.getElementById("descricaoResumo").textContent =
    a.Descricao || "-";

document.getElementById("responsavelResumo").textContent =
    a.Responsavel || "-";

document.getElementById("periodoResumo").textContent =
    `${String(a.Mes).padStart(2, "0")}/${a.Ano}`;
  }

async function carregarGruposConta() {
  const resposta = await fetch("http://localhost:3000/api/grupos-conta");
  gruposConta = await resposta.json();

  const select = document.getElementById("vfGrupoConta");
  select.innerHTML = `<option value="">Grupo de conta</option>`;

  gruposConta.forEach(g => {
    select.innerHTML += `
      <option value="${g.Id}">
        ${g.CodigoGrupo || ""} ${g.Designacao}
      </option>
    `;
  });
}

async function carregarValoresEmFalta() {
  const resposta = await fetch(
    `http://localhost:3000/api/gestor/valores-em-falta?utilizadorId=${utilizadorId}&analiseId=${analiseId}`
  );

  const valores = await resposta.json();

  valoresEmFaltaAtuais = valores;

  preencherValoresEmFalta(valores);
}

function preencherValoresEmFalta(valores) {
  const container = document.getElementById("listaValoresEmFalta");
  container.innerHTML = "";

  let custosPendentes = 0;
  let proveitosPendentes = 0;

  let custosAcumulados = 0;
  let proveitosAcumulados = 0;

  if (!valores || valores.length === 0) {
    document.getElementById("totalValoresFalta").textContent = "0,00 €";
    container.innerHTML = "<p>Não existem valores em falta para esta análise.</p>";
    return;
  }

  valores.forEach(v => {
    

    const estado = obterEstadoVisual(v);
    const natureza = normalizar(v.Natureza);
    const tipo = normalizar(v.TipoCustoVariavel);

    const valor = Math.abs(Number(v.Valor || 0));

if (estado === "Transitado") {

    if (natureza === "CUSTO") {
        custosAcumulados += valor;
    } else if (natureza === "PROVEITO") {
        proveitosAcumulados += valor;
    }

} else {

    if (natureza === "CUSTO") {
        custosPendentes += valor;
    } else if (natureza === "PROVEITO") {
        proveitosPendentes += valor;
    }

}

    const etiquetaNatureza =
      natureza === "CUSTO"
        ? `<span class="tag tag-custo">Custo</span>`
        : natureza === "PROVEITO"
          ? `<span class="tag tag-proveito">Proveito</span>`
          : `<span class="tag tag-sem-classificacao">Sem natureza</span>`;

    const etiquetaTipo =
      tipo === "FIXO"
        ? `<span class="tag tag-fixo">Fixo</span>`
        : tipo === "VARIAVEL"
          ? `<span class="tag tag-variavel">Variável</span>`
          : `<span class="tag tag-sem-classificacao">Sem tipo</span>`;

    const acaoApagar =
      estado === "Novo"
        ? `
          <button class="btn-apagar-valor" onclick="apagarValorEmFalta(${v.Id})">
            <i class="fa-solid fa-trash"></i> Apagar
          </button>
        `
        : `
          <span class="bloqueado-info">
            <i class="fa-solid fa-lock"></i> Bloqueado
          </span>
        `;

    container.innerHTML += `
      <div class="analise-card-wide">
        <div>
          <div class="movimento-tags">
            <span class="tag ${classeEstadoValorFalta(v)}">${estado}</span>
            ${etiquetaNatureza}
            <span class="tag tag-grupo">${v.CodigoGrupo || "--"} ${v.GrupoConta || "Sem grupo"}</span>
            ${etiquetaTipo}
          </div>

          <h3>${v.Descricao}</h3>
          <p>Origem: ${v.Origem || "-"}</p>

          ${
            estado === "Transitado" && v.MesOrigem && v.AnoOrigem
              ? `<p>Adicionado em: ${String(v.MesOrigem).padStart(2, "0")}/${v.AnoOrigem}</p>`
              : ""
          }

          ${
            v.MesPrevisto && v.AnoPrevisto
              ? `<p>Previsão: ${String(v.MesPrevisto).padStart(2, "0")}/${v.AnoPrevisto}</p>`
              : ""
          }

          ${v.Comentario ? `<p>Comentário: ${v.Comentario}</p>` : ""}
        </div>

        <div class="analise-status-area">
          <strong>${formatarNumero(v.Valor)} EUR</strong>

          <div class="valor-falta-acoes">
            <button class="btn-adicionar-real" onclick="adicionarAoReal(${v.Id})">
              <i class="fa-solid fa-plus"></i> Integrar no Real
            </button>

            <button class="btn-reclassificar-valor" onclick="reclassificarValor(${v.Id})">
              <i class="fa-solid fa-arrow-right-arrow-left"></i> Reclassificar
            </button>

            ${acaoApagar}
          </div>
        </div>
      </div>
    `;
  });

  document.getElementById("custosPendentes").textContent =
    `${formatarNumero(custosPendentes)} €`;

    document.getElementById("proveitosPendentes").textContent =
        `${formatarNumero(proveitosPendentes)} €`;

    document.getElementById("custosAcumulados").textContent =
        `${formatarNumero(custosAcumulados)} €`;

    document.getElementById("proveitosAcumulados").textContent =
        `${formatarNumero(proveitosAcumulados)} €`;

    const totalPendente =
    custosPendentes + proveitosPendentes;

const totalAcumulado =
    custosAcumulados + proveitosAcumulados;

document.getElementById("totalValoresFalta").textContent =
    `${formatarNumero(totalPendente + totalAcumulado)} €`;
}

function adicionarAoReal(id) {
  alert("Funcionalidade ainda não implementada.");
}

function reclassificarValor(id) {
  const valor = valoresEmFaltaAtuais.find(v => Number(v.Id) === Number(id));

  if (!valor) {
    abrirModalConfirmacao("Não foi possível encontrar o valor selecionado.", () => {}, "Erro");
    return;
  }

  document.getElementById("reclassificarValorId").value = id;

  document.getElementById("reclassificarResumo").innerHTML = `
    <div class="movimento-tags">
      <span class="tag ${classeEstadoValorFalta(valor)}">${obterEstadoVisual(valor)}</span>
      <span class="tag ${normalizar(valor.Natureza) === "CUSTO" ? "tag-custo" : "tag-proveito"}">
        ${normalizar(valor.Natureza) === "CUSTO" ? "Custo" : "Proveito"}
      </span>
      <span class="tag tag-grupo">
        ${valor.CodigoGrupo || "--"} ${valor.GrupoConta || "Sem grupo"}
      </span>
    </div>

    <h4>${valor.Descricao}</h4>
    <p><strong>Valor:</strong> ${formatarNumero(valor.Valor)} EUR</p>
    <p><strong>Origem:</strong> ${valor.Origem || "-"}</p>
    ${
      valor.MesPrevisto && valor.AnoPrevisto
        ? `<p><strong>Previsão:</strong> ${String(valor.MesPrevisto).padStart(2, "0")}/${valor.AnoPrevisto}</p>`
        : ""
    }
  `;

  const select = document.getElementById("reclassificarGrupoConta");
  select.innerHTML = `<option value="">Novo grupo de conta</option>`;

  gruposConta.forEach(g => {
    select.innerHTML += `
      <option value="${g.Id}" ${Number(g.Id) === Number(valor.GrupoContaId) ? "selected" : ""}>
        ${g.CodigoGrupo || ""} ${g.Designacao}
      </option>
    `;
  });

  document.getElementById("reclassificarComentario").value = "";
  document.getElementById("modalReclassificar").classList.remove("hidden");
}

async function guardarReclassificacao() {
  const valorEmFaltaId = document.getElementById("reclassificarValorId").value;
  const grupoContaId = document.getElementById("reclassificarGrupoConta").value;
  const comentario = document.getElementById("reclassificarComentario").value.trim();

  if (!grupoContaId) {
    abrirModalConfirmacao("Escolha o novo grupo de conta.", () => {}, "Campo obrigatório");
    return;
  }

  fecharModalReclassificar();

  abrirModalConfirmacao(
    "Este valor será reclassificado para outro grupo de conta. Deseja continuar?",
    async () => {
      const resposta = await fetch(`http://localhost:3000/api/gestor/valores-em-falta/${valorEmFaltaId}/reclassificar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          utilizadorId,
          analiseId,
          grupoContaId,
          comentario
        })
      });

      const resultado = await resposta.json();

      if (resultado.success) {
        mostrarToast("Valor reclassificado com sucesso.");
        carregarValoresEmFalta();
      } else {
        abrirModalConfirmacao(
          resultado.message || "Erro ao reclassificar valor.",
          () => {},
          "Erro"
        );
      }
    },
    "Confirmar Reclassificação"
  );
}

function fecharModalReclassificar() {
  document.getElementById("modalReclassificar").classList.add("hidden");
}

async function apagarValorEmFalta(id) {
  abrirModalConfirmacao(
    "Este valor em falta será apagado. Deseja continuar?",
    async () => {
      const resposta = await fetch(`http://localhost:3000/api/gestor/valores-em-falta/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          utilizadorId,
          analiseId
        })
      });

      const resultado = await resposta.json();

      if (resultado.success) {
        mostrarToast("Valor em falta apagado com sucesso.");
        carregarValoresEmFalta();
      } else {
        abrirModalConfirmacao(
          resultado.message || "Erro ao apagar valor em falta.",
          () => {},
          "Erro"
        );
      }
    },
    "Confirmar eliminação"
  );
}

function normalizar(valor) {
  return String(valor || "").trim().toUpperCase();
}

function obterEstadoVisual(v) {
  if (v.Estado === "REGULARIZADO") return "Regularizado";

  if (
    Number(v.AnoOrigem) < Number(analiseAtual.Ano) ||
    (
      Number(v.AnoOrigem) === Number(analiseAtual.Ano) &&
      Number(v.MesOrigem) < Number(analiseAtual.Mes)
    )
  ) {
    return "Transitado";
  }

  return "Novo";
}

document.getElementById("abrirFormValorFaltaBtn").addEventListener("click", () => {
  document.getElementById("modalValorFalta").classList.remove("hidden");
});

function fecharModalValorFalta() {
  document.getElementById("modalValorFalta").classList.add("hidden");
}

document.getElementById("modalValorFalta").addEventListener("click", (e) => {
  if (e.target.id === "modalValorFalta") {
    fecharModalValorFalta();
  }
});

async function guardarValorEmFalta() {
  const descricao = document.getElementById("vfDescricao").value.trim();
  const grupoContaId = document.getElementById("vfGrupoConta").value;
  const tipoCustoVariavel = document.querySelector('input[name="vfTipo"]:checked')?.value;
  const origem = document.getElementById("vfOrigem").value;
  const valor = document.getElementById("vfValor").value;
  const mesAnoPrevisto = document.getElementById("vfMesPrevisto").value;
  const comentario = document.getElementById("vfComentario").value.trim();

  if (!descricao || !grupoContaId || !tipoCustoVariavel || !origem || !valor || !mesAnoPrevisto) {
    alert("Preencha descrição, grupo de conta, valor, mês previsto, tipo e origem.");
    return;
  }

  const grupoSelecionado = gruposConta.find(g => String(g.Id) === String(grupoContaId));

  let natureza = null;

  if (grupoSelecionado?.TipoProveito && !grupoSelecionado?.TipoCusto) {
    natureza = "PROVEITO";
  } else if (grupoSelecionado?.TipoCusto && !grupoSelecionado?.TipoProveito) {
    natureza = "CUSTO";
  } else {
    natureza = Number(valor) >= 0 ? "PROVEITO" : "CUSTO";
  }

  const [anoPrevisto, mesPrevisto] = mesAnoPrevisto.split("-");

  const resposta = await fetch("http://localhost:3000/api/gestor/valores-em-falta", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      utilizadorId,
      analiseId,
      grupoContaId,
      descricao,
      natureza,
      tipoCustoVariavel,
      origem,
      valor,
      mesPrevisto,
      anoPrevisto,
      comentario
    })
  });

  const resultado = await resposta.json();

  if (resultado.success) {
    fecharModalValorFalta();
    limparFormulario();
    carregarValoresEmFalta();

    mostrarToast("Valor adicionado com sucesso.");
  } else {
    abrirModalConfirmacao(
        resultado.message || "Ocorreu um erro.",
        () => {},
        "Erro"
    );
  }
}

function limparFormulario() {
  document.getElementById("vfDescricao").value = "";
  document.getElementById("vfGrupoConta").value = "";
  document.getElementById("vfOrigem").value = "";
  document.getElementById("vfValor").value = "";
  document.getElementById("vfMesPrevisto").value = "";
  document.getElementById("vfComentario").value = "";

  document.querySelectorAll('input[name="vfTipo"]').forEach(r => r.checked = false);
}

function voltarSAP() {
  window.location.href = `analise-economica.html?analiseId=${analiseId}`;
}

function abrirReal() {
  alert("Controlo Económico (REAL) ainda não implementado.");
}

function abrirReal() {
  window.location.href = `controlo-economico.html?analiseId=${analiseId}`;
}

function formatarNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function classeEstadoValorFalta(v) {
  const estado = obterEstadoVisual(v);

  if (estado === "Regularizado") return "tag-regularizado";
  if (estado === "Transitado") return "tag-transitado";

  return "tag-novo";
}

let callbackConfirmacao = null;

function abrirModalConfirmacao(texto, callback, titulo = "Confirmar ação") {
  document.getElementById("modalTitulo").textContent = titulo;
  document.getElementById("modalTexto").textContent = texto;

  callbackConfirmacao = callback;
  document.getElementById("modalConfirmacao").classList.remove("hidden");
}

function fecharModalConfirmacao() {
  document.getElementById("modalConfirmacao").classList.add("hidden");
}

document.getElementById("btnCancelarModal").addEventListener("click", fecharModalConfirmacao);
document.getElementById("fecharModal").addEventListener("click", fecharModalConfirmacao);

document.getElementById("btnConfirmarModal").addEventListener("click", () => {
  fecharModalConfirmacao();

  if (callbackConfirmacao) {
    callbackConfirmacao();
  }
});

function mostrarToast(mensagem) {
  const toast = document.createElement("div");
  toast.className = "toast-sucesso";

  toast.innerHTML = `
    <i class="fa-solid fa-circle-check"></i>
    <span>${mensagem}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}