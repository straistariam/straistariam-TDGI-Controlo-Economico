const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("errorMessage");
const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";

  togglePassword.innerHTML = isPassword
    ? '<i class="fa-regular fa-eye-slash"></i>'
    : '<i class="fa-regular fa-eye"></i>';
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  errorMessage.textContent = "";

  if (!email.endsWith("@tdgi.pt")) {
    errorMessage.textContent = "Utilize um e-mail corporativo TDGI.";
    return;
  }


  try {
    const response = await fetch("http://localhost:3000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!data.success) {
      errorMessage.textContent = data.message;
      return;
    }

    localStorage.setItem("id", data.user.Id);
    localStorage.setItem("nome", data.user.Nome);
    localStorage.setItem("perfil", data.user.Perfil);
    localStorage.setItem("email", data.user.Email);

    if (data.user.Perfil === "GESTOR") {
      window.location.href = "pages/dashboard-gestor.html";
    } else if (data.user.Perfil === "DIRETOR") {
      window.location.href = "pages/dashboard-diretor.html";
    } else if (data.user.Perfil === "ADMIN") {
      window.location.href = "pages/dashboard-admin.html";
    } else {
      errorMessage.textContent = "Perfil de utilizador inválido.";
    }

  } catch (error) {
    errorMessage.textContent = "Erro ao comunicar com o servidor.";
  }
});