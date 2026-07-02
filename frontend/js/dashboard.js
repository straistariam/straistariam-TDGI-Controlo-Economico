const nome = localStorage.getItem("nome");
const perfil = localStorage.getItem("perfil");

const userName = document.getElementById("userName");
const userRole = document.getElementById("userRole");
const logoutBtn = document.getElementById("logoutBtn");

if (!perfil) {
  window.location.href = "../index.html";
}

if (userName) userName.textContent = nome || "Utilizador";
if (userRole) userRole.textContent = perfil || "";

logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "../index.html";
});

const createUserForm = document.getElementById("createUserForm");

if (createUserForm) {
  createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nome = document.getElementById("newNome").value.trim();
    const email = document.getElementById("newEmail").value.trim().toLowerCase();
    const password = document.getElementById("newPassword").value.trim();
    const perfil = document.getElementById("newPerfil").value;
    const message = document.getElementById("createUserMessage");

    message.textContent = "";

    if (!email.endsWith("@tdgi.pt")) {
      message.style.color = "#c62828";
      message.textContent = "O email deve ser corporativo TDGI.";
      return;
    }

    if (password.length < 6) {
      message.style.color = "#c62828";
      message.textContent = "A password deve ter pelo menos 6 caracteres.";
      return;
    }

    try {
      const response = await fetch("http://localhost:3000/utilizadores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nome,
          email,
          password,
          perfil
        })
      });

      const data = await response.json();

      if (!data.success) {
        message.style.color = "#c62828";
        message.textContent = data.message;
        return;
      }

      message.style.color = "#027a48";
      message.textContent = "Utilizador criado com sucesso.";

      createUserForm.reset();

    } catch (error) {
      message.style.color = "#c62828";
      message.textContent = "Erro ao comunicar com o servidor.";
    }
  });
}

async function carregarDashboardGestor() {
  const utilizadorId = localStorage.getItem("id");

  const resposta = await fetch(
    `http://localhost:3000/api/gestor/dashboard?utilizadorId=${utilizadorId}`
  );

  const dados = await resposta.json();

  if (!dados) return;

  document.getElementById("centroCustoGestor").textContent = "Vários";
  document.getElementById("periodoAnalise").textContent =
    `${String(dados.Mes).padStart(2, "0")}/${dados.Ano}`;
  document.getElementById("prazoSubmissao").textContent =
    new Date(dados.DataLimite).toLocaleDateString("pt-PT");

  document.getElementById("totalContratos").textContent = dados.TotalContratos || 0;
  document.getElementById("totalEmAnalise").textContent = dados.TotalEmAnalise || 0;
  document.getElementById("totalSubmetidos").textContent = dados.TotalSubmetidos || 0;
  document.getElementById("totalPorIniciar").textContent = dados.TotalPorIniciar || 0;
  
 if (dados.UltimaImportacao) {
  const dataImportacao = new Date(dados.UltimaImportacao);

  document.getElementById("ultimaImportacao").textContent =
    `${dataImportacao.toLocaleDateString("pt-PT")} às ${dataImportacao.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }
}

carregarDashboardGestor();

async function carregarAnalisesPeriodoAtual() {
  const utilizadorId = localStorage.getItem("id");

  const resposta = await fetch(
    `http://localhost:3000/api/gestor/analises-atuais?utilizadorId=${utilizadorId}`
  );

  const analises = await resposta.json();
  const container = document.getElementById("analisesPeriodoAtual");

  container.innerHTML = "";

  if (!analises || analises.length === 0) {
    container.innerHTML = "<p>Não existem análises para este período.</p>";
    return;
  }

  analises.forEach(a => {
    container.innerHTML += `
      <div class="analise-card-wide ${obterClasseEstado(a.Estado)}">
        <div>
          <h3>${a.NomeContrato}</h3>
          <p>Centro de Custo: ${a.CentroCusto}</p>
          <p>Período: ${String(a.Mes).padStart(2, "0")}/${a.Ano}</p>
        </div>

        <div class="analise-status-area">
          

          <p>Prazo: ${formatarData(a.DataLimite)}</p>

          <button onclick="iniciarOuContinuarAnalise(${a.Id})">
            ${textoBotao(a.Estado)}
          </button>
        </div>
      </div>
    `;
  });
}


function formatarEstado(estado) {
  const estados = {
    POR_INICIAR: "Por iniciar",
    EM_ANALISE: "Em análise",
    SUBMETIDO: "Submetido",
    VALIDADO: "Validado"
  };

  return estados[estado] || estado;
}

function textoBotao(estado) {
  if (estado === "POR_INICIAR") return "Iniciar Análise";
  if (estado === "EM_ANALISE") return "Continuar";
  return "Ver Análise";
}

async function iniciarOuContinuarAnalise(id) {
  const utilizadorId = localStorage.getItem("id");

  await fetch("http://localhost:3000/api/gestor/iniciar-analise", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      utilizadorId,
      analiseId: id
    })
  });

  window.location.href = `analise-economica.html?analiseId=${id}`;
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-PT");
}

carregarAnalisesPeriodoAtual();

function obterClasseEstado(estado) {

  if (estado === "SUBMETIDO" || estado === "VALIDADO") {
    return "estado-submetido";
  }

  if (estado === "EM_ANALISE") {
    return "estado-analise";
  }

  return "estado-por-iniciar";
}

