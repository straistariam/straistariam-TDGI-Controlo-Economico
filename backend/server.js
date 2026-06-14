const express = require("express");
const cors = require("cors");
const sql = require("mssql/msnodesqlv8");
const bcrypt = require("bcrypt");

const app = express();

app.use(cors());
app.use(express.json());

const dbConfig = {
  connectionString:
    "Driver={ODBC Driver 17 for SQL Server};Server=localhost\\SQLEXPRESS;Database=Analise3D;Trusted_Connection=yes;"
};

app.get("/", (req, res) => {
  res.send("Backend Análise 3D ativo.");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("Email", sql.NVarChar, email)
      .query(`
        SELECT Id, Nome, Email, PasswordHash, Perfil
        FROM Utilizador
        WHERE Email = @Email
        AND Ativo = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas."
      });
    }

    const user = result.recordset[0];

    const passwordValida = await bcrypt.compare(password, user.PasswordHash);

    if (!passwordValida) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas."
      });
    }

    res.json({
      success: true,
      user: {
        Id: user.Id,
        Nome: user.Nome,
        Email: user.Email,
        Perfil: user.Perfil
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro na base de dados."
    });
  }
});

app.post("/utilizadores", async (req, res) => {
  const { nome, email, password, perfil } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await sql.connect(dbConfig);

    await pool.request()
      .input("Nome", sql.NVarChar, nome)
      .input("Email", sql.NVarChar, email)
      .input("PasswordHash", sql.NVarChar, passwordHash)
      .input("Perfil", sql.NVarChar, perfil)
      .query(`
        INSERT INTO Utilizador (Nome, Email, PasswordHash, Perfil, Ativo)
        VALUES (@Nome, @Email, @PasswordHash, @Perfil, 1)
      `);

    res.json({
      success: true,
      message: "Utilizador criado com sucesso."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao criar utilizador."
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor ativo em http://localhost:3000");
});