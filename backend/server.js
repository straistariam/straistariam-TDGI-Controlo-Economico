const express = require("express");
const cors = require("cors");
const sql = require("mssql/msnodesqlv8");

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
            .input("Password", sql.NVarChar, password)
            .query(`
                SELECT
                    Id,
                    Nome,
                    Email,
                    Perfil
                FROM Utilizador
                WHERE Email = @Email
                AND PasswordHash = @Password
                AND Ativo = 1
            `);

        if (result.recordset.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Credenciais inválidas."
            });

        }

        res.json({
            success: true,
            user: result.recordset[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Erro na base de dados."
        });

    }

});

app.listen(3000, () => {
    console.log("Servidor ativo em http://localhost:3000");
});