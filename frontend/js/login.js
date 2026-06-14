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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email.endsWith("@tdgi.pt")) {
    errorMessage.textContent = "Utilize um e-mail corporativo TDGI.";
    return;
  }

  if (password.length < 6) {
    errorMessage.textContent = "A palavra-passe deve ter pelo menos 6 caracteres.";
    return;
  }

  errorMessage.textContent = "";
  alert("Login pronto para ligar ao backend.");
});