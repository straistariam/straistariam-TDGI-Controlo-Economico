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