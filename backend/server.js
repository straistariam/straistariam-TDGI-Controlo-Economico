const express = require("express");
const cors = require("cors");
const sql = require("mssql/msnodesqlv8");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

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
        WHERE Email = @Email AND Ativo = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ success: false, message: "Credenciais inválidas." });
    }

    const user = result.recordset[0];
    const passwordValida = await bcrypt.compare(password, user.PasswordHash);

    if (!passwordValida) {
      return res.status(401).json({ success: false, message: "Credenciais inválidas." });
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
    res.status(500).json({ success: false, message: "Erro na base de dados." });
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

    res.json({ success: true, message: "Utilizador criado com sucesso." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao criar utilizador." });
  }
});

app.get("/ficheiros", async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const pasta = await obterPastaDados(pool);
    const ficheiros = fs.readdirSync(pasta);

    res.json(ficheiros);

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/importar-movimentos", async (req, res) => {
  try {
    const resultado = await importarMovimentosAutomaticamente();

    res.json({
      success: true,
      message: "Movimentos importados com sucesso.",
      ...resultado
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao importar movimentos."
    });
  }
});

async function importarMovimentosAutomaticamente() {
  const pool = await sql.connect(dbConfig);
  const pasta = await obterPastaDados(pool);

  const ficheiros = fs
    .readdirSync(pasta)
    .filter(f => f.startsWith("CC") && f.endsWith(".xlsx"));

  let totalImportado = 0;
  let ficheirosImportados = 0;
  let ficheirosIgnorados = 0;

  for (const ficheiro of ficheiros) {
    const jaImportado = await pool.request()
      .input("NomeFicheiro", sql.NVarChar, ficheiro)
      .query(`
        SELECT Id
        FROM ImportacaoFicheiro
        WHERE NomeFicheiro = @NomeFicheiro
      `);

    if (jaImportado.recordset.length > 0) {
      ficheirosIgnorados++;
      continue;
    }

    console.log(`A importar ficheiro: ${ficheiro}`);

    const caminho = path.join(pasta, ficheiro);
    const workbook = XLSX.readFile(caminho);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const linhas = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: false
    });

    let linhasImportadasFicheiro = 0;

    for (const linha of linhas) {
      const centroCusto = linha["Centro custo"];

      if (centroCusto === null || centroCusto === undefined || centroCusto === "") {
        continue;
      }

      await pool.request()
        .input("CentroCusto", sql.NVarChar, linha["Centro custo"])
        .input("NumeroDocumentoReferencia", sql.NVarChar, linha["Nº doc.de referência"])
        .input("Referencia", sql.NVarChar, linha["Referência"])
        .input("Estornado", sql.NVarChar, linha["Estornado"])
        .input("NumeroRefEstorno", sql.NVarChar, linha["Nº ref.estorno"])
        .input("ClasseCusto", sql.NVarChar, linha["Classe de custo"])
        .input("DescricaoClasseCusto", sql.NVarChar, linha["Descr.classe custo"])
        .input("ValorMR", sql.Decimal(18, 2), converterNumero(linha["Valor/MR"]))
        .input("MoedaRelatorio", sql.NVarChar, linha["Moeda do relatório"])
        .input("ValorMoedaObjeto", sql.Decimal(18, 2), converterNumero(linha["Valor/moeda objeto"]))
        .input("MoedaObjeto", sql.NVarChar, linha["Moeda do objeto"])
        .input("ContaContrapartida", sql.NVarChar, linha["Conta lnçto.contrap."])
        .input("DescricaoContaContrapartida", sql.NVarChar, linha["Descrição da conta de contrapartida"])
        .input("DataDocumento", sql.Date, converterData(linha["Data do documento"]))
        .input("Periodo", sql.Int, converterInteiro(linha["Período"]))
        .input("DocumentoCompras", sql.NVarChar, linha["Documento de compras"])
        .input("QuantidadeTotalEntrada", sql.Decimal(18, 3), converterNumero(linha["Qtd.total entrada"]))
        .input("Denominacao", sql.NVarChar, linha["Denominação"])
        .input("TextoCabecalhoDocumento", sql.NVarChar, linha["Texto de cabeçalho de documento"])
        .input("NomeUtilizador", sql.NVarChar, linha["Nome do usuário"])
        .input("OrigemFicheiro", sql.NVarChar, ficheiro)
        .query(`
          INSERT INTO MovimentoContabilistico (
            CentroCusto,
            NumeroDocumentoReferencia,
            Referencia,
            Estornado,
            NumeroRefEstorno,
            ClasseCusto,
            DescricaoClasseCusto,
            ValorMR,
            MoedaRelatorio,
            ValorMoedaObjeto,
            MoedaObjeto,
            ContaContrapartida,
            DescricaoContaContrapartida,
            DataDocumento,
            Periodo,
            DocumentoCompras,
            QuantidadeTotalEntrada,
            Denominacao,
            TextoCabecalhoDocumento,
            NomeUtilizador,
            OrigemFicheiro
          )
          VALUES (
            @CentroCusto,
            @NumeroDocumentoReferencia,
            @Referencia,
            @Estornado,
            @NumeroRefEstorno,
            @ClasseCusto,
            @DescricaoClasseCusto,
            @ValorMR,
            @MoedaRelatorio,
            @ValorMoedaObjeto,
            @MoedaObjeto,
            @ContaContrapartida,
            @DescricaoContaContrapartida,
            @DataDocumento,
            @Periodo,
            @DocumentoCompras,
            @QuantidadeTotalEntrada,
            @Denominacao,
            @TextoCabecalhoDocumento,
            @NomeUtilizador,
            @OrigemFicheiro
          )
        `);

      totalImportado++;
      linhasImportadasFicheiro++;
    }

    await pool.request()
      .input("NomeFicheiro", sql.NVarChar, ficheiro)
      .input("TipoFicheiro", sql.NVarChar, "MOVIMENTOS")
      .input("TotalLinhas", sql.Int, linhasImportadasFicheiro)
      .query(`
        INSERT INTO ImportacaoFicheiro
        (NomeFicheiro, TipoFicheiro, TotalLinhas)
        VALUES
        (@NomeFicheiro, @TipoFicheiro, @TotalLinhas)
      `);

    ficheirosImportados++;
  }

  console.log(`Importação automática concluída. Linhas: ${totalImportado}`);

  return {
    ficheirosEncontrados: ficheiros.length,
    ficheirosImportados,
    ficheirosIgnorados,
    totalImportado
  };
}

async function obterPastaDados(pool) {
  const config = await pool.request().query(`
    SELECT Valor
    FROM ConfiguracaoSistema
    WHERE Chave = 'PASTA_DADOS_TDGI'
  `);

  if (config.recordset.length === 0) {
    throw new Error("Configuração da pasta não encontrada.");
  }

  return config.recordset[0].Valor;
}

function converterNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return valor;

  const texto = String(valor)
    .replace(/\s/g, "")
    .replace("EUR", "")
    .replace(",", ".");

  const numero = Number(texto);
  return isNaN(numero) ? null : numero;
}

function converterInteiro(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = parseInt(valor, 10);
  return isNaN(numero) ? null : numero;
}

function converterData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;

  const data = new Date(valor);
  return isNaN(data.getTime()) ? null : data;
}

app.listen(3000, async () => {
  console.log("Servidor ativo em http://localhost:3000");

  try {
    const resultado = await importarMovimentosAutomaticamente();
    console.log("Resultado importação automática:", resultado);
  } catch (error) {
    console.error("Erro na importação automática:", error.message);
  }
});