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