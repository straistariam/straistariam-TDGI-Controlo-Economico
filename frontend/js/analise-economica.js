let movimentosAtuais = [];

const nome = localStorage.getItem("nome");
const perfil = localStorage.getItem("perfil");
const utilizadorId = localStorage.getItem("id");

document.getElementById("userName").textContent = nome || "Utilizador";
document.getElementById("userRole").textContent = perfil || "";

const params = new URLSearchParams(window.location.search);
const analiseId = params.get("analiseId");

async function carregarAnaliseEconomica() {
  const resposta = await fetch(
    `http://localhost:3000/api/gestor/analise-economica?utilizadorId=${utilizadorId}&analiseId=${analiseId}`
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    alert(dados.message || "Erro ao carregar análise.");
    return;
  }

  preencherCabecalho(dados.analise);
  preencherResumoMovimentos(dados.movimentos);
  preencherMovimentos(dados.movimentos);
  atualizarTextoBotaoGuardar(dados.movimentos);
}

function atualizarTextoBotaoGuardar(movimentos) {
  const jaCaracterizados = movimentos.some(m => m.Tipo);

  document.getElementById("guardarCaracterizacaoBtn").textContent =
    jaCaracterizados ? "Guardar Edição" : "Guardar Caracterização";
}
function abrirReal() {
  window.location.href = `controlo-economico.html?analiseId=${analiseId}`;
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

function preencherResumoMovimentos(movimentos) {
  let totalCustos = 0;
  let totalProveitos = 0;
  let semClassificacao = 0;

  movimentos.forEach(m => {
    const valor = Number(m.ValorMR || 0);
    const tipo = obterTipo(m);

    if (tipo === "Proveito") {
      totalProveitos += valor;
    } else if (tipo === "Custo") {
      totalCustos += valor;
    }
  });

  document.getElementById("totalProveitos").textContent =
    `${formatarNumero(totalProveitos)} €`;

  document.getElementById("totalCustos").textContent =
    `${formatarNumero(totalCustos)} €`;

  document.getElementById("totalMovimentos").textContent = movimentos.length;
  document.getElementById("semClassificacao").textContent = semClassificacao;
}

function preencherMovimentos(movimentos) {
  movimentosAtuais = movimentos;
  const container = document.getElementById("listaMovimentosAnalise");
  container.innerHTML = "";

  if (!movimentos || movimentos.length === 0) {
    container.innerHTML = "<p>Não existem movimentos para esta análise.</p>";
    return;
  }

  movimentos.forEach(m => {
  const tipo = obterTipo(m);

  container.innerHTML += `
    <div class="analise-card-wide">
      <div>
        <div class="movimento-tags">
          <span class="tag ${tipo === "Custo" ? "tag-custo" : tipo === "Proveito" ? "tag-proveito" : "tag-sem-classificacao"}">
            ${tipo}
          </span>

          <span class="tag tag-grupo">
            ${m.CodigoGrupo || "--"} ${m.GrupoConta || "Sem grupo"}
          </span>

          ${m.ValorAntecipado ? `
          <span class="tag tag-antecipado">
            Valor antecipado
          </span>
        ` : ""}
        </div>

        <h3>${m.TextoCabecalhoDocumento || m.Denominacao || m.DescricaoClasseCusto || "Movimento contabilístico"}</h3>

        <p>Documento contabilístico: ${m.NumeroDocumentoReferencia || "-"}</p>
        <p>Conta contabilística: ${m.ClasseCusto || "-"}</p>
        ${m.ValorAntecipado ? `
        <div class="antecipado-info">
          <p>
            <i class="fa-solid fa-calendar-days"></i>
            Regularização prevista:
            <strong>${nomeMes(m.MesRegularizacao)} ${m.AnoRegularizacao}</strong>
          </p>

          ${m.Comentario ? `
            <p>
              <i class="fa-solid fa-comment-dots"></i>
              ${m.Comentario}
            </p>
          ` : ""}
        </div>
      ` : ""}
      </div>

      <div class="analise-status-area">
        <strong>${formatarNumero(m.ValorMR)} ${m.MoedaRelatorio || ""}</strong>

        <br>

        <div class="tipo-radio">
          <label>
            <input 
              type="radio" 
              name="tipo-${m.Id}" 
              value="FIXO"
              ${m.Tipo === "FIXO" ? "checked" : ""}>
            Fixo
          </label>

          <label>
            <input 
              type="radio" 
              name="tipo-${m.Id}" 
              value="VARIAVEL"
              ${m.Tipo === "VARIAVEL" ? "checked" : ""}>
            Variável
          </label>
        </div>

        <div class="antecipado-area">
        <button type="button" class="btn-regularizar-real" onclick="mostrarAntecipado(${m.Id})">
          ${m.ValorAntecipado ? "Editar Valor Antecipado" : "+ Valor Antecipado"}
        </button>
        <button type="button" class="btn-regularizar-real" onclick="abrirRegularizacaoReal(${m.Id})">
          <i class="fa-solid fa-link"></i>
          Regularizar Real
        </button>

        <div
          id="antecipado-${m.Id}"
          class="antecipado-form hidden"
          data-existe="${m.ValorAntecipado ? "1" : "0"}">

          <button
            type="button"
            class="fechar-antecipado"
            onclick="fecharAntecipado(${m.Id})">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <div class="antecipado-grid">
            <select class="mes-regularizacao">
              <option value="">Mês</option>
              ${gerarOpcoesMes(m.MesRegularizacao)}
            </select>

            <input 
              type="number" 
              class="ano-regularizacao" 
              placeholder="Ano"
              min="2026"
              max="2031"
              value="${m.AnoRegularizacao || ""}"
            >
          </div>

          <textarea 
            class="comentario-antecipado" 
            placeholder="Comentário "
          >${m.Comentario || ""}</textarea>

          <div class="antecipado-actions">
            <button
              type="button"
              class="btn-guardar-antecipado"
              onclick="guardarValorAntecipado(${m.Id})">
              ${m.ValorAntecipado ? "Guardar Edição" : "Guardar "}
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
`;
});
}

let callbackConfirmacao = null;



function abrirModalConfirmacao(texto, callback, titulo = "Confirmar valor antecipado") {
  document.querySelector(".modal-top h3").textContent = titulo;
  document.getElementById("modalTexto").textContent = texto;

  callbackConfirmacao = callback;

  document.getElementById("modalConfirmacao").classList.remove("hidden");
}

function fecharModalConfirmacao() {
  document
    .getElementById("modalConfirmacao")
    .classList.add("hidden");
}

document
  .getElementById("btnCancelarModal")
  .addEventListener("click", fecharModalConfirmacao);

document
  .getElementById("fecharModal")
  .addEventListener("click", fecharModalConfirmacao);

document
  .getElementById("btnConfirmarModal")
  .addEventListener("click", () => {

    fecharModalConfirmacao();

    if (callbackConfirmacao) {
      callbackConfirmacao();
    }

  });

async function guardarValorAntecipado(movimentoId) {
  const form = document.getElementById(`antecipado-${movimentoId}`);

  const mesRegularizacao =
    form.querySelector(".mes-regularizacao").value || null;

  const anoRegularizacao =
    form.querySelector(".ano-regularizacao").value || null;

  const comentario =
    form.querySelector(".comentario-antecipado").value.trim() || null;

  const anoAtual = new Date().getFullYear();
  const anoNumero = Number(anoRegularizacao);

  if (!mesRegularizacao || !anoRegularizacao) {
    alert("Indique o mês e o ano de regularização.");
    return;
  }

  if (anoNumero < anoAtual || anoNumero > anoAtual + 5) {
    alert(`O ano de regularização deve estar entre ${anoAtual} e ${anoAtual + 5}.`);
    return;
  }

  const jaTemValorAntecipado = form.dataset.existe === "1";

  const textoModal = jaTemValorAntecipado
    ? "Este valor antecipado será atualizado. Deseja guardar a edição?"
    : "Este movimento será marcado como valor antecipado. Deseja guardar esta informação?";

  abrirModalConfirmacao(
    textoModal,
    async () => {
      const resposta = await fetch(
        "http://localhost:3000/api/gestor/guardar-valor-antecipado",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            utilizadorId,
            analiseId,
            movimentoId,
            valorAntecipado: 1,
            mesRegularizacao,
            anoRegularizacao,
            comentario
          })
        }
      );

      const resultado = await resposta.json();

      if (resultado.success) {

        form.classList.add("hidden");

        mostrarToast(
          jaTemValorAntecipado
            ? "Valor antecipado atualizado com sucesso."
            : "Valor antecipado guardado com sucesso."
        );

        carregarAnaliseEconomica();

      } else {
        alert(resultado.message || "Erro ao guardar o valor antecipado.");
      }
    },
    jaTemValorAntecipado
      ? "Confirmar edição"
      : "Confirmar valor antecipado"
  );
}

function nomeMes(mes) {
  const meses = [
    "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return meses[Number(mes)] || "-";
}

function obterBadgeTipo(m) {
  const tipo = obterTipo(m);

  if (tipo === "Custo") {
    return `<span class="badge-custo">Custo</span>`;
  }

  if (tipo === "Proveito") {
    return `<span class="badge-proveito">Proveito</span>`;
  }

  return `<span class="badge-sem-classificacao">Sem classificação</span>`;
}

function obterTipo(m) {
  if (m.TipoProveito && !m.TipoCusto) return "Proveito";
  if (m.TipoCusto && !m.TipoProveito) return "Custo";

  if (m.TipoCusto && m.TipoProveito) {
    return Number(m.ValorMR) >= 0 ? "Proveito" : "Custo";
  }

  return "Sem classificação";
}

function formatarNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-PT");
}
document.getElementById("guardarCaracterizacaoBtn").addEventListener("click", async () => {
  const radiosSelecionados = document.querySelectorAll(".tipo-radio input:checked");

  const movimentos = [];

  radiosSelecionados.forEach(radio => {
    const movimentoId = radio.name.replace("tipo-", "");

  

  movimentos.push({
    movimentoId: Number(movimentoId),
    tipo: radio.value
  });
  });

  
  const resposta = await fetch("http://localhost:3000/api/gestor/guardar-caracterizacao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      utilizadorId,
      analiseId,
      movimentos
    })
  });

  const resultado = await resposta.json();

  if (resultado.success) {

    const editar =
      document.getElementById("guardarCaracterizacaoBtn")
        .textContent.includes("Edição");

    mostrarToast(
      editar
        ? "Caracterização atualizada com sucesso."
        : "Caracterização guardada com sucesso."
    );

    carregarAnaliseEconomica();

  } else {

    alert(resultado.message || "Erro ao guardar caracterização.");

  }

  
});
function mostrarAntecipado(id) {
  document.getElementById(`antecipado-${id}`).classList.remove("hidden");
}

function fecharAntecipado(id) {
  const form = document.getElementById(`antecipado-${id}`);

  form.classList.add("hidden");
  form.querySelector(".mes-regularizacao").value = "";
  form.querySelector(".ano-regularizacao").value = "";
  form.querySelector(".comentario-antecipado").value = "";
}


function gerarOpcoesMes(mesSelecionado) {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return meses.map((nome, index) => {
    const valor = index + 1;
    return `
      <option value="${valor}" ${Number(mesSelecionado) === valor ? "selected" : ""}>
        ${nome}
      </option>
    `;
  }).join("");
}
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

function abrirValoresEmFalta() {
  window.location.href = `valores-em-falta.html?analiseId=${analiseId}`;
}
carregarAnaliseEconomica();

async function abrirRegularizacaoReal(movimentoId) {
  const movimento = movimentosAtuais.find(m => Number(m.Id) === Number(movimentoId));

  if (!movimento) {
    abrirModalConfirmacao("Não foi possível encontrar o movimento.", () => {}, "Erro");
    return;
  }

  document.getElementById("regularizarMovimentoId").value = movimentoId;

  document.getElementById("regularizarResumo").innerHTML = `
    <div class="movimento-tags">
      <span class="tag ${obterTipo(movimento) === "Custo" ? "tag-custo" : "tag-proveito"}">
        ${obterTipo(movimento)}
      </span>

      <span class="tag tag-grupo">
        ${movimento.CodigoGrupo || "--"} ${movimento.GrupoConta || "Sem grupo"}
      </span>
    </div>

    <h4>${movimento.TextoCabecalhoDocumento || movimento.Denominacao || movimento.DescricaoClasseCusto || "Movimento contabilístico"}</h4>
    <p><strong>Documento:</strong> ${movimento.NumeroDocumentoReferencia || "-"}</p>
    <p><strong>Conta:</strong> ${movimento.ClasseCusto || "-"}</p>
    <p><strong>Valor contabilístico:</strong> ${formatarNumero(movimento.ValorMR)} ${movimento.MoedaRelatorio || "EUR"}</p>
  `;

  const select = document.getElementById("regularizarValorPendente");
  select.innerHTML = `<option value="">A carregar pendentes...</option>`;

  const resposta = await fetch(
    `http://localhost:3000/api/gestor/regularizar-real/opcoes?utilizadorId=${utilizadorId}&analiseId=${analiseId}&movimentoId=${movimentoId}`
  );

  const dados = await resposta.json();

  select.innerHTML = `<option value="">Selecione um valor pendente</option>`;

  if (!dados.success || !dados.pendentes || dados.pendentes.length === 0) {
    select.innerHTML = `<option value="">Sem pendentes compatíveis</option>`;
  } else {
    dados.pendentes.forEach(p => {
      select.innerHTML += `
        <option value="${p.Id}">
          ${p.Descricao} | ${formatarNumero(p.Valor)} € | ${p.CodigoGrupo || "--"} ${p.GrupoConta || ""}
        </option>
      `;
    });
  }

  

  document.getElementById("regularizarComentario").value = "";
  document.getElementById("modalRegularizarReal").classList.remove("hidden");
}

function fecharModalRegularizarReal() {
  document.getElementById("modalRegularizarReal").classList.add("hidden");
}

async function guardarRegularizacaoReal() {
  const movimentoId = document.getElementById("regularizarMovimentoId").value;
  const valorEmFaltaId = document.getElementById("regularizarValorPendente").value;
  const comentario = document.getElementById("regularizarComentario").value.trim();

  if (!valorEmFaltaId) {
    abrirModalConfirmacao(
      "Selecione um valor pendente do Real.",
      () => {},
      "Campo obrigatório"
    );
    return;
  }

  fecharModalRegularizarReal();

  abrirModalConfirmacao(
    "Deseja regularizar este movimento contabilístico com o valor pendente selecionado?",
    async () => {
      const resposta = await fetch("http://localhost:3000/api/gestor/regularizar-real", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          utilizadorId,
          analiseId,
          movimentoId,
          valorEmFaltaId,
          comentario
        })
      });

      const resultado = await resposta.json();

      if (resultado.success) {
        mostrarToast("Real regularizado com sucesso.");
        carregarAnaliseEconomica();
      } else {
        abrirModalConfirmacao(
          resultado.message || "Erro ao regularizar Real.",
          () => {},
          "Erro"
        );
      }
    },
    "Confirmar regularização"
  );
}