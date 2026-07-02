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
      const centroCusto = String(linha["Centro custo"] ?? "").trim();

      if (!centroCusto) {
        continue;
      }

      await garantirCentroCusto(pool, centroCusto);

      await pool.request()
        .input("CentroCusto", sql.NVarChar, centroCusto)
        .input("NumeroDocumentoReferencia", sql.NVarChar, linha["Nº doc.de referência"])
        .input("Referencia", sql.NVarChar, linha["Referência"])
        .input("Estornado", sql.Bit, linha["estornado"] === "X" ? 1 : 0)
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

    await criarAnalisesMensaisParaFicheiro(pool, ficheiro);

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

async function garantirCentroCusto(pool, centroCusto) {
  const existe = await pool.request()
    .input("CentroCusto", sql.NVarChar, centroCusto)
    .query(`
      SELECT CentroCusto
      FROM CentroCusto
      WHERE CentroCusto = @CentroCusto
    `);

  if (existe.recordset.length > 0) return;

  await pool.request()
  .input("CentroCusto", sql.NVarChar, centroCusto)
  .input("Descricao", sql.NVarChar, "Centro a definir")
  .input("Responsavel", sql.NVarChar, "Responsável a definir")
  .input("AreaHierarquia", sql.NVarChar, "Área a definir")
  .query(`
    INSERT INTO CentroCusto (
      CentroCusto,
      Descricao,
      Responsavel,
      AreaHierarquia
    )
    VALUES (
      @CentroCusto,
      @Descricao,
      @Responsavel,
      @AreaHierarquia
    )
  `);

console.log(`Centro de custo criado automaticamente: ${centroCusto}`);
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

  let texto = String(valor)
    .replace(/EUR/gi, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .trim();

  // Formato inglês: 1,925.60
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(texto)) {
    texto = texto.replace(/,/g, "");
  }
  // Formato português: 1 925,60 ou 1.925,60
  else if (/^-?\d{1,3}([ .]\d{3})+,\d+$/.test(texto) || texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = Number(texto);
  return isNaN(numero) ? null : numero;
}

function converterInteiro(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = parseInt(valor, 10);
  return isNaN(numero) ? null : numero;
}

function converterData(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const texto = String(valor).trim();

  const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  const mes = Number(match[1]);
  const dia = Number(match[2]);
  let ano = Number(match[3]);

  if (ano < 100) ano += 2000;

  return new Date(ano, mes - 1, dia);
}

function converterDataHora(valor) {
  if (!valor) return null;

  const texto = String(valor).trim();

  const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  let ano = Number(match[3]);

  if (ano < 100) ano += 2000;

  return new Date(Date.UTC(ano, mes - 1, dia, 0, 0, 0));
}

async function importarNotasEncomendaAutomaticamente() {
  const pool = await sql.connect(dbConfig);
  const pasta = await obterPastaDados(pool);

  const ficheiro = fs
    .readdirSync(pasta)
    .find(f => f.toLowerCase().includes("total ne") && f.toLowerCase().endsWith(".csv"));

  if (!ficheiro) {
    console.log("Ficheiro Total NE.csv não encontrado.");
    return { ficheirosImportados: 0, ficheirosIgnorados: 0, totalImportado: 0 };
  }

  const jaImportado = await pool.request()
    .input("NomeFicheiro", sql.NVarChar, ficheiro)
    .query(`
      SELECT Id
      FROM ImportacaoFicheiro
      WHERE NomeFicheiro = @NomeFicheiro
    `);

  if (jaImportado.recordset.length > 0) {
    console.log(`Notas de encomenda já importadas: ${ficheiro}`);
    return { ficheirosImportados: 0, ficheirosIgnorados: 1, totalImportado: 0 };
  }

  console.log(`A importar notas de encomenda: ${ficheiro}`);

  const caminho = path.join(pasta, ficheiro);
  const workbook = XLSX.readFile(caminho, { raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const linhas = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false
  });

  let totalImportado = 0;

  for (const linha of linhas) {
    const centroCusto = String(linha["Centro de Custo"] ?? "").trim();

    if (!centroCusto) {
      continue;
    }

    await garantirCentroCusto(pool, centroCusto);

    await pool.request()
      .input("DataCriacaoItem", sql.DateTime, converterDataHora(linha["Data de Criação de Item"]))
      .input("NumeroNecessidade", sql.NVarChar, linha["Nr. Necessidade"])
      .input("DocumentoCompra", sql.NVarChar, linha["Doc. Compra"])
      .input("Item", sql.NVarChar, linha["Item"])
      .input("DescricaoPedido", sql.NVarChar, linha["Descrição Pedido"])
      .input("CentroCusto", sql.NVarChar, centroCusto)
      .input("IDFornecedor", sql.NVarChar, linha["ID Fornecedor"])
      .input("NomeFornecedor", sql.NVarChar, linha["Nome Fornecedor"])
      .input("QuantidadePedido", sql.Decimal(18, 2), converterNumero(linha["Quantidade Pedida"]))
      .input("ValorPedido", sql.Decimal(18, 2), converterNumero(linha["Valor Pedido €"]))
      .input("QuantidadeFaturada", sql.Decimal(18, 2), converterNumero(linha["Quantidade Faturada"]))
      .input("ValorFaturado", sql.Decimal(18, 2), converterNumero(linha["Valor Faturado €"]))
      .input("DataFatura", sql.DateTime, converterDataHora(linha["Data fatura "]))
      .input("OrigemFicheiro", sql.NVarChar, ficheiro)
      .query(`
        INSERT INTO NotaEncomenda (
          DataCriacaoItem,
          NumeroNecessidade,
          DocumentoCompra,
          Item,
          DescricaoPedido,
          CentroCusto,
          IDFornecedor,
          NomeFornecedor,
          QuantidadePedido,
          ValorPedido,
          QuantidadeFaturada,
          ValorFaturado,
          DataFatura,
          OrigemFicheiro
        )
        VALUES (
          @DataCriacaoItem,
          @NumeroNecessidade,
          @DocumentoCompra,
          @Item,
          @DescricaoPedido,
          @CentroCusto,
          @IDFornecedor,
          @NomeFornecedor,
          @QuantidadePedido,
          @ValorPedido,
          @QuantidadeFaturada,
          @ValorFaturado,
          @DataFatura,
          @OrigemFicheiro
        )
      `);

    totalImportado++;
  }

  await pool.request()
    .input("NomeFicheiro", sql.NVarChar, ficheiro)
    .input("TipoFicheiro", sql.NVarChar, "NOTAS_ENCOMENDA")
    .input("TotalLinhas", sql.Int, totalImportado)
    .query(`
      INSERT INTO ImportacaoFicheiro
      (NomeFicheiro, TipoFicheiro, TotalLinhas)
      VALUES
      (@NomeFicheiro, @TipoFicheiro, @TotalLinhas)
    `);

  console.log(`Notas de encomenda importadas. Linhas: ${totalImportado}`);

  return {
    ficheirosImportados: 1,
    ficheirosIgnorados: 0,
    totalImportado
  };
}

app.post("/importar-notas-encomenda", async (req, res) => {
  try {
    const resultado = await importarNotasEncomendaAutomaticamente();

    res.json({
      success: true,
      message: "Notas de encomenda importadas com sucesso.",
      ...resultado
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Erro ao importar notas de encomenda."
    });
  }
});

app.get("/api/gestor/dashboard", async (req, res) => {
  try {
    const { utilizadorId } = req.query;
    const pool = await sql.connect(dbConfig);

    await criarAnalisesMensaisEmFalta(pool, utilizadorId);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .query(`
        WITH PeriodoAtual AS (
          SELECT TOP 1 Ano, Mes
          FROM AnaliseMensal
          WHERE GestorId = @UtilizadorId
          ORDER BY Ano DESC, Mes DESC
        )
        SELECT
          p.Ano,
          p.Mes,
          MAX(a.DataLimite) AS DataLimite,

          (
            SELECT TOP 1 DataImportacao
            FROM ImportacaoFicheiro
            ORDER BY DataImportacao DESC
          ) AS UltimaImportacao,

          COUNT(*) AS TotalContratos,
          SUM(CASE WHEN a.Estado = 'EM_ANALISE' THEN 1 ELSE 0 END) AS TotalEmAnalise,
          SUM(CASE WHEN a.Estado = 'SUBMETIDO' THEN 1 ELSE 0 END) AS TotalSubmetidos,
          SUM(CASE WHEN a.Estado = 'POR_INICIAR' THEN 1 ELSE 0 END) AS TotalPorIniciar
        FROM PeriodoAtual p
        JOIN AnaliseMensal a
          ON a.Ano = p.Ano
         AND a.Mes = p.Mes
        WHERE a.GestorId = @UtilizadorId
        GROUP BY p.Ano, p.Mes
      `);

    res.json(result.recordset[0] || null);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar dashboard do gestor." });
  }
});

app.get("/api/gestor/meus-contratos", async (req, res) => {
  try {
    const { utilizadorId } = req.query;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .query(`
        SELECT
          Id,
          NomeContrato,
          CentroCusto,
          Ano,
          Mes,
          Estado,
          DataLimite,
          DataInicio,
          DataSubmissao
        FROM AnaliseMensal
        WHERE GestorId = @UtilizadorId
        ORDER BY Ano DESC, Mes DESC
      `);

    res.json(result.recordset);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Erro ao carregar contratos."
    });
  }
});

app.get("/api/gestor/contratos", async (req, res) => {
  try {
    const { utilizadorId } = req.query;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .query(`
        SELECT DISTINCT
          a.CentroCusto,
          a.NomeContrato
        FROM AnaliseMensal a
        WHERE a.GestorId = @UtilizadorId
        ORDER BY a.NomeContrato
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar contratos." });
  }
});

app.get("/api/gestor/movimentos", async (req, res) => {
  try {
    const { utilizadorId, centroCusto, ano, mes, tipo, grupo } = req.query;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("CentroCusto", sql.NVarChar, centroCusto)
      .input("Ano", sql.Int, ano)
      .input("Mes", sql.Int, mes)
      .input("Tipo", sql.NVarChar, tipo || null)
      .input("Grupo", sql.NVarChar, grupo || null)
      .query(`
        SELECT
          m.CentroCusto,
          m.NumeroDocumentoReferencia,
          m.Referencia,
          m.ClasseCusto,
          m.DescricaoClasseCusto,
          m.ValorMR,
          m.MoedaRelatorio,
          m.DataDocumento,
          m.DocumentoCompras,
          m.Denominacao,
          gc.CodigoGrupo,
          gc.Designacao AS GrupoConta,
          gc.TipoCusto,
          gc.TipoProveito,
          CASE
            WHEN gc.TipoCusto IS NOT NULL 
                AND gc.TipoProveito IS NOT NULL 
                AND m.ValorMR >= 0 THEN 'PROVEITO'

            WHEN gc.TipoCusto IS NOT NULL 
                AND gc.TipoProveito IS NOT NULL 
                AND m.ValorMR < 0 THEN 'CUSTO'

            WHEN gc.TipoProveito IS NOT NULL THEN 'PROVEITO'
            WHEN gc.TipoCusto IS NOT NULL THEN 'CUSTO'

            ELSE 'SEM_CLASSIFICACAO'
          END AS TipoMovimento
        FROM MovimentoContabilistico m
        JOIN UtilizadorCentroCusto ucc
          ON ucc.CentroCusto = m.CentroCusto
        OUTER APPLY (
        SELECT TOP 1
          mp.Id,
          mp.ContaGenerica,
          mp.GrupoContaId
        FROM MapaConta mp
        WHERE
          (
            mp.ContaGenerica NOT LIKE '%*'
            AND m.ClasseCusto = mp.ContaGenerica
          )
          OR
          (
            mp.ContaGenerica LIKE '%*'
            AND m.ClasseCusto LIKE REPLACE(mp.ContaGenerica, '*', '') + '%'
          )
        ORDER BY
          CASE
            WHEN mp.ContaGenerica NOT LIKE '%*' THEN 1
            ELSE 2
          END
      ) mp
      LEFT JOIN GrupoConta gc
        ON gc.Id = mp.GrupoContaId
        WHERE ucc.UtilizadorId = @UtilizadorId
          AND m.CentroCusto = @CentroCusto
          AND m.OrigemFicheiro LIKE '%_' +
          RIGHT('0' + CAST(@Mes AS NVARCHAR), 2) +
          '.' + CAST(@Ano AS NVARCHAR) + '%'
          AND (
            @Tipo IS NULL
            OR @Tipo = ''
            OR (
              @Tipo = 'CUSTO'
              AND (
                (gc.TipoCusto IS NOT NULL AND gc.TipoProveito IS NULL)
                OR
                (gc.TipoCusto IS NOT NULL AND gc.TipoProveito IS NOT NULL AND m.ValorMR < 0)
              )
            )
            OR (
              @Tipo = 'PROVEITO'
              AND (
                (gc.TipoProveito IS NOT NULL AND gc.TipoCusto IS NULL)
                OR
                (gc.TipoCusto IS NOT NULL AND gc.TipoProveito IS NOT NULL AND m.ValorMR >= 0)
              )
            )
            OR (
              @Tipo = 'SEM_CLASSIFICACAO'
              AND gc.Id IS NULL
            )
          )
          AND (
            @Grupo IS NULL
            OR @Grupo = ''
            OR gc.CodigoGrupo = @Grupo
          )
        ORDER BY m.DataDocumento DESC
      `);

    res.json(result.recordset);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar movimentos." });
  }
});

async function criarAnalisesMensaisEmFalta(pool, utilizadorId) {
  await pool.request()
    .input("UtilizadorId", sql.Int, utilizadorId)
    .query(`
      INSERT INTO AnaliseMensal (
        GestorId,
        CentroCusto,
        NomeContrato,
        Ano,
        Mes,
        Estado,
        DataLimite
      )
      SELECT DISTINCT
        ucc.UtilizadorId,
        m.CentroCusto,
        cc.Descricao,
        CAST(SUBSTRING(m.OrigemFicheiro, CHARINDEX('.', m.OrigemFicheiro) + 1, 4) AS INT) AS Ano,
        CAST(SUBSTRING(m.OrigemFicheiro, CHARINDEX('_', m.OrigemFicheiro) + 1, 2) AS INT) AS Mes,
        'POR_INICIAR',
        DATEFROMPARTS(
          CAST(SUBSTRING(m.OrigemFicheiro, CHARINDEX('.', m.OrigemFicheiro) + 1, 4) AS INT),
          CAST(SUBSTRING(m.OrigemFicheiro, CHARINDEX('_', m.OrigemFicheiro) + 1, 2) AS INT) + 1,
          7
        )
      FROM UtilizadorCentroCusto ucc
      JOIN MovimentoContabilistico m
        ON m.CentroCusto = ucc.CentroCusto
      JOIN CentroCusto cc
        ON cc.CentroCusto = m.CentroCusto
      WHERE ucc.UtilizadorId = @UtilizadorId
        AND m.OrigemFicheiro LIKE '%_[0-1][0-9].20%'
        AND NOT EXISTS (
          SELECT 1
          FROM AnaliseMensal a
          WHERE a.GestorId = ucc.UtilizadorId
            AND a.CentroCusto = m.CentroCusto
            AND a.Ano = CAST(SUBSTRING(m.OrigemFicheiro, CHARINDEX('.', m.OrigemFicheiro) + 1, 4) AS INT)
            AND a.Mes = CAST(SUBSTRING(m.OrigemFicheiro, CHARINDEX('_', m.OrigemFicheiro) + 1, 2) AS INT)
        );
    `);
}

app.get("/api/gestor/valores-em-falta", async (req, res) => {
  try {
    const { utilizadorId, analiseId } = req.query;

    const pool = await sql.connect(dbConfig);

    const acesso = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT Id
        FROM AnaliseMensal
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId
      `);

    if (acesso.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso à análise."
      });
    }

    const resultado = await pool.request()
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT
            vf.Id,
            vf.Descricao,
            vf.Origem,
            vf.ValorOriginal,
            vf.ValorPendente,
            vf.ValorPendente AS Valor,
            vf.Comentario,
            vf.Estado,
            vf.DataCriacao,

            vf.Natureza,
            vf.TipoCustoVariavel,
            vf.MesPrevisto,
            vf.AnoPrevisto,

            aOrigem.Mes AS MesOrigem,
            aOrigem.Ano AS AnoOrigem,

            gc.Id AS GrupoContaId,
            gc.CodigoGrupo,
            gc.Designacao AS GrupoConta

        FROM ValorEmFalta vf
        JOIN AnaliseMensal aOrigem
            ON aOrigem.Id = vf.AnaliseId
        JOIN AnaliseMensal aAtual
            ON aAtual.Id = @AnaliseId
        LEFT JOIN GrupoConta gc
            ON gc.Id = vf.GrupoContaId

        WHERE
            aOrigem.CentroCusto = aAtual.CentroCusto
            AND vf.Estado = 'ATIVO'
            AND (
                vf.AnaliseId = @AnaliseId
                OR (
                    aOrigem.Ano < aAtual.Ano
                    OR (
                        aOrigem.Ano = aAtual.Ano
                        AND aOrigem.Mes < aAtual.Mes
                    )
                )
            )

        ORDER BY
            aOrigem.Ano DESC,
            aOrigem.Mes DESC,
            vf.DataCriacao DESC
      `);

    res.json(resultado.recordset);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Erro ao carregar valores em falta."
    });
  }
});

app.get("/api/grupos-conta", async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().query(`
      SELECT
        Id,
        CodigoGrupo,
        Designacao,
        TipoCusto,
        TipoProveito
      FROM GrupoConta
      ORDER BY CodigoGrupo
    `);

    res.json(result.recordset);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Erro ao carregar grupos de conta."
    });
  }
});

app.post("/api/gestor/valores-em-falta", async (req, res) => {
  try {
    const {
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
    } = req.body;

    if (
      !grupoContaId ||
      !descricao ||
      !natureza ||
      !tipoCustoVariavel ||
      !origem ||
      valor === null ||
      valor === undefined ||
      valor === "" ||
      !mesPrevisto ||
      !anoPrevisto
    ) {
      return res.status(400).json({
        success: false,
        message: "Preencha todos os campos obrigatórios."
      });
    }

    const pool = await sql.connect(dbConfig);

    const acesso = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT Id
        FROM AnaliseMensal
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId
      `);

    if (acesso.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso à análise."
      });
    }

    await pool.request()
      .input("AnaliseId", sql.Int, analiseId)
      .input("GrupoContaId", sql.Int, grupoContaId)
      .input("Descricao", sql.NVarChar, descricao)
      .input("Origem", sql.NVarChar, origem)
      .input("Valor", sql.Decimal(18, 2), valor)
      .input("Comentario", sql.NVarChar, comentario || null)
      .input("Estado", sql.NVarChar, "ATIVO")
      .input("Natureza", sql.NVarChar, natureza)
      .input("TipoCustoVariavel", sql.NVarChar, tipoCustoVariavel)
      .input("MesPrevisto", sql.Int, mesPrevisto)
      .input("AnoPrevisto", sql.Int, anoPrevisto)
      .query(`
        INSERT INTO ValorEmFalta (
          AnaliseId,
          GrupoContaId,
          Descricao,
          Origem,
          Valor,
          ValorOriginal,
          ValorPendente,
          Comentario,
          Estado,
          Natureza,
          TipoCustoVariavel,
          MesPrevisto,
          AnoPrevisto
        )
        VALUES (
          @AnaliseId,
          @GrupoContaId,
          @Descricao,
          @Origem,
          @Valor,
          @Valor,
          @Valor,
          @Comentario,
          @Estado,
          @Natureza,
          @TipoCustoVariavel,
          @MesPrevisto,
          @AnoPrevisto
        )
      `);

    res.json({
      success: true,
      message: "Valor integrado no Real com sucesso."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao guardar valor em falta."
    });
  }
});
app.get("/api/gestor/notas-encomenda", async (req, res) => {
  try {
    const { utilizadorId, centroCusto, ano, mes } = req.query;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("CentroCusto", sql.NVarChar, centroCusto)
      .input("Ano", sql.Int, ano)
      .input("Mes", sql.Int, mes)
      .query(`
        SELECT
          ne.CentroCusto,
          ne.DocumentoCompra,
          ne.NumeroNecessidade,
          ne.Item,
          ne.DescricaoPedido,
          ne.NomeFornecedor,
          ne.QuantidadePedido,
          ne.ValorPedido,
          ne.QuantidadeFaturada,
          ne.ValorFaturado,
          ne.DataCriacaoItem,
          ne.DataFatura
        FROM NotaEncomenda ne
        JOIN UtilizadorCentroCusto ucc
          ON ucc.CentroCusto = ne.CentroCusto
        WHERE ucc.UtilizadorId = @UtilizadorId
          AND ne.CentroCusto = @CentroCusto
          AND YEAR(ne.DataCriacaoItem) = @Ano
          AND MONTH(ne.DataCriacaoItem) = @Mes
        ORDER BY ne.DataCriacaoItem DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar notas de encomenda." });
  }
});

app.get("/api/gestor/analise-economica", async (req, res) => {
  try {
    const { utilizadorId, analiseId } = req.query;
    const pool = await sql.connect(dbConfig);

    const analise = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT
          a.Id,
          a.CentroCusto,
          a.Ano,
          a.Mes,
          a.Estado,
          a.DataLimite,
          cc.Descricao,
          cc.Responsavel
        FROM AnaliseMensal a
        LEFT JOIN CentroCusto cc
          ON cc.CentroCusto = a.CentroCusto
        WHERE a.Id = @AnaliseId
          AND a.GestorId = @UtilizadorId
      `);

    if (analise.recordset.length === 0) {
      return res.status(403).json({ message: "Sem acesso a esta análise." });
    }

    const dadosAnalise = analise.recordset[0];

    const resumo = await pool.request()
      .input("CentroCusto", sql.NVarChar, dadosAnalise.CentroCusto)
      .input("Ano", sql.Int, dadosAnalise.Ano)
      .input("Mes", sql.Int, dadosAnalise.Mes)
      .query(`
        SELECT
          gc.CodigoGrupo,
          gc.Designacao,
          gc.TipoCusto,
          gc.TipoProveito,
          SUM(mc.ValorMR) AS TotalValor,
          COUNT(*) AS TotalMovimentos
        FROM MovimentoContabilistico mc
        OUTER APPLY (
          SELECT TOP 1
            mp.Id,
            mp.ContaGenerica,
            mp.GrupoContaId
          FROM MapaConta mp
          WHERE
            (
              mp.ContaGenerica NOT LIKE '%*'
              AND mc.ClasseCusto = mp.ContaGenerica
            )
            OR
            (
              mp.ContaGenerica LIKE '%*'
              AND mc.ClasseCusto LIKE REPLACE(mp.ContaGenerica, '*', '') + '%'
            )
          ORDER BY
            CASE
              WHEN mp.ContaGenerica NOT LIKE '%*' THEN 1
              ELSE 2
            END
        ) mp
        LEFT JOIN GrupoConta gc
          ON gc.Id = mp.GrupoContaId
        WHERE mc.CentroCusto = @CentroCusto
          AND mc.OrigemFicheiro LIKE '%_' + RIGHT('0' + CAST(@Mes AS NVARCHAR), 2) + '.' + CAST(@Ano AS NVARCHAR) + '%'
        GROUP BY gc.CodigoGrupo, gc.Designacao, gc.TipoCusto, gc.TipoProveito
        ORDER BY gc.CodigoGrupo
      `);

    const movimentos = await pool.request()
      .input("AnaliseId", sql.Int, analiseId)
      .input("CentroCusto", sql.NVarChar, dadosAnalise.CentroCusto)
      .input("Ano", sql.Int, dadosAnalise.Ano)
      .input("Mes", sql.Int, dadosAnalise.Mes)
      .query(`
        SELECT
          mc.Id,
          mc.CentroCusto,
          mc.NumeroDocumentoReferencia,
          mc.Referencia,
          mc.Estornado,
          mc.NumeroRefEstorno,
          mc.ClasseCusto,
          mc.DescricaoClasseCusto,
          mc.ValorMR,
          mc.MoedaRelatorio,
          mc.ValorMoedaObjeto,
          mc.MoedaObjeto,
          mc.ContaContrapartida,
          mc.DescricaoContaContrapartida,
          mc.DataDocumento,
          mc.Periodo,
          mc.DocumentoCompras,
          mc.QuantidadeTotalEntrada,
          mc.Denominacao,
          mc.TextoCabecalhoDocumento,
          mc.NomeUtilizador,
          mp.ContaGenerica,
          gc.CodigoGrupo,
          gc.Designacao AS GrupoConta,
          gc.TipoCusto,
          gc.TipoProveito,
          am.Tipo,
          am.ValorAntecipado,
          am.MesRegularizacao,
          am.AnoRegularizacao,
          am.Comentario
        FROM MovimentoContabilistico mc
        OUTER APPLY (
          SELECT TOP 1
            mp.Id,
            mp.ContaGenerica,
            mp.GrupoContaId
          FROM MapaConta mp
          WHERE
            (
              mp.ContaGenerica NOT LIKE '%*'
              AND mc.ClasseCusto = mp.ContaGenerica
            )
            OR
            (
              mp.ContaGenerica LIKE '%*'
              AND mc.ClasseCusto LIKE REPLACE(mp.ContaGenerica, '*', '') + '%'
            )
          ORDER BY
            CASE
              WHEN mp.ContaGenerica NOT LIKE '%*' THEN 1
              ELSE 2
            END
        ) mp
        LEFT JOIN GrupoConta gc
          ON gc.Id = mp.GrupoContaId
        LEFT JOIN AnaliseMovimento am
          ON am.MovimentoId = mc.Id
         AND am.AnaliseId = @AnaliseId
        WHERE mc.CentroCusto = @CentroCusto
          AND mc.OrigemFicheiro LIKE '%_' +
          RIGHT('0' + CAST(@Mes AS NVARCHAR), 2) +
          '.' + CAST(@Ano AS NVARCHAR) + '%'
        ORDER BY mc.DataDocumento DESC
      `);

    res.json({
      analise: dadosAnalise,
      resumo: resumo.recordset,
      movimentos: movimentos.recordset
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar análise económica." });
  }
});

app.post("/api/gestor/guardar-valor-antecipado", async (req, res) => {
  try {
    const {
      utilizadorId,
      analiseId,
      movimentoId,
      valorAntecipado,
      mesRegularizacao,
      anoRegularizacao,
      comentario
    } = req.body;

    const pool = await sql.connect(dbConfig);

    const acesso = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT Id
        FROM AnaliseMensal
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId
          
      `);

    if (acesso.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso ou prazo da análise terminado."
      });
    }

    await pool.request()
      .input("AnaliseId", sql.Int, analiseId)
      .input("MovimentoId", sql.Int, movimentoId)
      .input("ValorAntecipado", sql.Bit, valorAntecipado ? 1 : 0)
      .input("MesRegularizacao", sql.Int, mesRegularizacao || null)
      .input("AnoRegularizacao", sql.Int, anoRegularizacao || null)
      .input("Comentario", sql.NVarChar, comentario || null)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM AnaliseMovimento
          WHERE AnaliseId = @AnaliseId
            AND MovimentoId = @MovimentoId
        )
        BEGIN
          UPDATE AnaliseMovimento
          SET
            ValorAntecipado = @ValorAntecipado,
            MesRegularizacao = @MesRegularizacao,
            AnoRegularizacao = @AnoRegularizacao,
            Comentario = @Comentario,
            DataClassificacao = GETDATE()
          WHERE AnaliseId = @AnaliseId
            AND MovimentoId = @MovimentoId
        END
        ELSE
        BEGIN
          INSERT INTO AnaliseMovimento (
            AnaliseId,
            MovimentoId,
            Tipo,
            ValorAntecipado,
            MesRegularizacao,
            AnoRegularizacao,
            Comentario,
            DataClassificacao
          )
          VALUES (
            @AnaliseId,
            @MovimentoId,
            'VARIAVEL',
            @ValorAntecipado,
            @MesRegularizacao,
            @AnoRegularizacao,
            @Comentario,
            GETDATE()
          )
        END
      `);

    res.json({
      success: true,
      message: "Valor antecipado guardado com sucesso."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao guardar valor antecipado."
    });
  }
});

app.put("/api/gestor/valores-em-falta/:id/reclassificar", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      utilizadorId,
      analiseId,
      grupoContaId,
      comentario
    } = req.body;

    if (!grupoContaId) {
      return res.status(400).json({
        success: false,
        message: "Indique o novo grupo de conta."
      });
    }

    const pool = await sql.connect(dbConfig);

    const acesso = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .input("ValorEmFaltaId", sql.Int, id)
      .query(`
        SELECT vf.Id
        FROM ValorEmFalta vf
        JOIN AnaliseMensal aOrigem
          ON aOrigem.Id = vf.AnaliseId
        JOIN AnaliseMensal aAtual
          ON aAtual.Id = @AnaliseId
        WHERE vf.Id = @ValorEmFaltaId
          AND aAtual.GestorId = @UtilizadorId
          AND aOrigem.CentroCusto = aAtual.CentroCusto
          AND vf.Estado = 'ATIVO'
      `);

    if (acesso.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso ao valor em falta."
      });
    }

    const grupo = await pool.request()
      .input("GrupoContaId", sql.Int, grupoContaId)
      .query(`
        SELECT Id, TipoCusto, TipoProveito
        FROM GrupoConta
        WHERE Id = @GrupoContaId
      `);

    if (grupo.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Grupo de conta inválido."
      });
    }

    const g = grupo.recordset[0];

    let natureza = null;

    if (g.TipoProveito && !g.TipoCusto) {
      natureza = "PROVEITO";
    } else if (g.TipoCusto && !g.TipoProveito) {
      natureza = "CUSTO";
    } else {
      natureza = "CUSTO";
    }

    await pool.request()
      .input("ValorEmFaltaId", sql.Int, id)
      .input("GrupoContaId", sql.Int, grupoContaId)
      .input("Natureza", sql.NVarChar, natureza)
      .input("Comentario", sql.NVarChar, comentario || null)
      .query(`
        UPDATE ValorEmFalta
        SET
          GrupoContaId = @GrupoContaId,
          Natureza = @Natureza,
          Comentario =
            CASE
              WHEN @Comentario IS NULL THEN Comentario
              WHEN Comentario IS NULL THEN @Comentario
              ELSE Comentario + CHAR(13) + CHAR(10) + @Comentario
            END
        WHERE Id = @ValorEmFaltaId
      `);

    res.json({
      success: true,
      message: "Valor reclassificado com sucesso."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao reclassificar valor."
    });
  }
});

app.delete("/api/gestor/valores-em-falta/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { utilizadorId, analiseId } = req.body;

    const pool = await sql.connect(dbConfig);

    const resultado = await pool.request()
      .input("Id", sql.Int, id)
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        DELETE vf
        FROM ValorEmFalta vf
        JOIN AnaliseMensal am
          ON am.Id = vf.AnaliseId
        WHERE vf.Id = @Id
          AND vf.AnaliseId = @AnaliseId
          AND am.GestorId = @UtilizadorId
      `);

    res.json({
      success: true,
      message: "Valor em falta apagado com sucesso."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao apagar valor em falta."
    });
  }
});

app.get("/api/gestor/analises-atuais", async (req, res) => {
  try {
    const { utilizadorId } = req.query;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .query(`
        WITH PeriodoAtual AS (
          SELECT TOP 1 Ano, Mes
          FROM AnaliseMensal
          WHERE GestorId = @UtilizadorId
          ORDER BY Ano DESC, Mes DESC
        )
        SELECT
          a.Id,
          a.NomeContrato,
          a.CentroCusto,
          a.Ano,
          a.Mes,
          a.Estado,
          a.DataLimite
        FROM AnaliseMensal a
        JOIN PeriodoAtual p
          ON p.Ano = a.Ano
         AND p.Mes = a.Mes
        WHERE a.GestorId = @UtilizadorId
        ORDER BY a.NomeContrato
      `);

    res.json(result.recordset);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar análises atuais." });
  }
});

app.post("/importar-centros-custo", async (req, res) => {
  try {
    const resultado = await importarCentrosCustoAutomaticamente();

    res.json({
      success: true,
      message: "Centros de custo importados com sucesso.",
      ...resultado
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get("/importar-centros-custo", async (req, res) => {
  try {
    const resultado = await importarCentrosCustoAutomaticamente();

    res.json(resultado);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/gestor/iniciar-analise", async (req, res) => {
  try {
    const { utilizadorId, analiseId } = req.body;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        UPDATE AnaliseMensal
        SET 
          Estado = 'EM_ANALISE',
          DataInicio = ISNULL(DataInicio, GETDATE())
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId
          AND Estado = 'POR_INICIAR';

        SELECT Id, Estado, DataInicio
        FROM AnaliseMensal
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId;
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Análise não encontrada."
      });
    }

    res.json({
      success: true,
      analise: result.recordset[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Erro ao iniciar análise."
    });
  }
});

app.get("/api/gestor/caracterizacao-movimentos", async (req, res) => {
  try {
    const { utilizadorId, analiseId } = req.query;
    const pool = await sql.connect(dbConfig);

    const analise = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT Id, NomeContrato, CentroCusto, Ano, Mes, Estado
        FROM AnaliseMensal
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId
      `);

    if (analise.recordset.length === 0) {
      return res.status(403).json({ message: "Sem acesso a esta análise." });
    }

    const dados = analise.recordset[0];

    const movimentos = await pool.request()
      .input("AnaliseId", sql.Int, analiseId)
      .input("CentroCusto", sql.NVarChar, dados.CentroCusto)
      .input("Ano", sql.Int, dados.Ano)
      .input("Mes", sql.Int, dados.Mes)
      .query(`
        SELECT
          mc.Id,
          mc.ClasseCusto,
          mc.DescricaoClasseCusto,
          mc.TextoCabecalhoDocumento,
          mc.NumeroDocumentoReferencia,
          mc.ValorMR,
          mc.MoedaRelatorio,
          mc.DataDocumento,
          am.Tipo,
        FROM MovimentoContabilistico mc
        LEFT JOIN AnaliseMovimento am
          ON am.MovimentoId = mc.Id
         AND am.AnaliseId = @AnaliseId
        WHERE mc.CentroCusto = @CentroCusto
          AND mc.OrigemFicheiro LIKE '%_' +
              RIGHT('0' + CAST(@Mes AS NVARCHAR), 2) +
              '.' + CAST(@Ano AS NVARCHAR) + '%'
        ORDER BY mc.ClasseCusto, mc.DataDocumento
      `);

    res.json({
      analise: dados,
      movimentos: movimentos.recordset
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar movimentos." });
  }
});

app.get("/api/gestor/regularizar-real/opcoes", async (req, res) => {
  try {
    const { utilizadorId, analiseId, movimentoId } = req.query;

    const pool = await sql.connect(dbConfig);

    const movimento = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .input("MovimentoId", sql.Int, movimentoId)
      .query(`
        SELECT
          mc.Id,
          mc.ValorMR,
          a.CentroCusto,

          gc.Id AS GrupoContaId,

          CASE
            WHEN gc.TipoProveito IS NOT NULL AND gc.TipoCusto IS NULL THEN 'PROVEITO'
            WHEN gc.TipoCusto IS NOT NULL AND gc.TipoProveito IS NULL THEN 'CUSTO'
            WHEN gc.TipoCusto IS NOT NULL AND gc.TipoProveito IS NOT NULL AND mc.ValorMR >= 0 THEN 'PROVEITO'
            WHEN gc.TipoCusto IS NOT NULL AND gc.TipoProveito IS NOT NULL AND mc.ValorMR < 0 THEN 'CUSTO'
            ELSE NULL
          END AS Natureza

        FROM AnaliseMensal a
        JOIN MovimentoContabilistico mc
          ON mc.CentroCusto = a.CentroCusto
        OUTER APPLY (
          SELECT TOP 1 mp.GrupoContaId
          FROM MapaConta mp
          WHERE
            (mp.ContaGenerica NOT LIKE '%*' AND mc.ClasseCusto = mp.ContaGenerica)
            OR
            (mp.ContaGenerica LIKE '%*' AND mc.ClasseCusto LIKE REPLACE(mp.ContaGenerica, '*', '') + '%')
        ) mp
        LEFT JOIN GrupoConta gc
          ON gc.Id = mp.GrupoContaId
        WHERE a.Id = @AnaliseId
          AND a.GestorId = @UtilizadorId
          AND mc.Id = @MovimentoId
      `);

    if (movimento.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Movimento não encontrado."
      });
    }

    const mov = movimento.recordset[0];

    const pendentes = await pool.request()
      .input("CentroCusto", sql.NVarChar, mov.CentroCusto)
      .input("GrupoContaId", sql.Int, mov.GrupoContaId)
      .input("Natureza", sql.NVarChar, mov.Natureza)
      .query(`
        SELECT
          vf.Id,
          vf.Descricao,
          vf.ValorPendente AS Valor,
          vf.Origem,
          vf.MesPrevisto,
          vf.AnoPrevisto,
          vf.TipoCustoVariavel,
          vf.Natureza,
          gc.CodigoGrupo,
          gc.Designacao AS GrupoConta,
          a.Mes AS MesOrigem,
          a.Ano AS AnoOrigem
        FROM ValorEmFalta vf
        JOIN AnaliseMensal a
          ON a.Id = vf.AnaliseId
        LEFT JOIN GrupoConta gc
          ON gc.Id = vf.GrupoContaId
        WHERE a.CentroCusto = @CentroCusto
          AND vf.Estado = 'ATIVO'
          AND vf.Natureza = @Natureza
          AND vf.GrupoContaId = @GrupoContaId
        ORDER BY a.Ano, a.Mes, vf.DataCriacao
      `);

    res.json({
      success: true,
      movimento: mov,
      pendentes: pendentes.recordset
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao carregar pendentes compatíveis."
    });
  }
});

app.post("/api/gestor/regularizar-real", async (req, res) => {
  try {
    const {
      utilizadorId,
      analiseId,
      movimentoId,
      valorEmFaltaId,
      comentario
    } = req.body;

    if (!movimentoId || !valorEmFaltaId) {
      return res.status(400).json({
        success: false,
        message: "Selecione o valor pendente a regularizar."
      });
    }

    const pool = await sql.connect(dbConfig);

    const dados = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .input("MovimentoId", sql.Int, movimentoId)
      .input("ValorEmFaltaId", sql.Int, valorEmFaltaId)
      .query(`
        SELECT
          mc.Id AS MovimentoId,
          ABS(mc.ValorMR) AS ValorSAP,
          vf.Id AS ValorEmFaltaId,
          vf.ValorPendente
        FROM MovimentoContabilistico mc
        JOIN AnaliseMensal aAtual
          ON aAtual.Id = @AnaliseId
        JOIN ValorEmFalta vf
          ON vf.Id = @ValorEmFaltaId
        JOIN AnaliseMensal aOrigem
          ON aOrigem.Id = vf.AnaliseId
        WHERE mc.Id = @MovimentoId
          AND aAtual.GestorId = @UtilizadorId
          AND mc.CentroCusto = aAtual.CentroCusto
          AND aOrigem.CentroCusto = aAtual.CentroCusto
          AND vf.Estado = 'ATIVO'
      `);

    if (dados.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso ou valor pendente inválido."
      });
    }

    const item = dados.recordset[0];

    const valorSAP = Number(item.ValorSAP || 0);
    const valorPendente = Number(item.ValorPendente || 0);

    const valorRegularizado = Math.min(valorSAP, valorPendente);
    const novoPendente = valorPendente - valorRegularizado;

    await pool.request()
      .input("ValorEmFaltaId", sql.Int, valorEmFaltaId)
      .input("MovimentoId", sql.Int, movimentoId)
      .input("ValorRegularizado", sql.Decimal(18, 2), valorRegularizado)
      .input("NovoPendente", sql.Decimal(18, 2), novoPendente)
      .input("Comentario", sql.NVarChar, comentario || null)
      .input("UtilizadorId", sql.Int, utilizadorId)
      .query(`
        INSERT INTO RegularizacaoReal (
          ValorEmFaltaId,
          MovimentoContabilisticoId,
          ValorRegularizado,
          Comentario,
          UtilizadorId
        )
        VALUES (
          @ValorEmFaltaId,
          @MovimentoId,
          @ValorRegularizado,
          @Comentario,
          @UtilizadorId
        );

        UPDATE ValorEmFalta
        SET
          ValorPendente = @NovoPendente,
          Estado = CASE
            WHEN @NovoPendente <= 0 THEN 'REGULARIZADO'
            ELSE 'ATIVO'
          END,
          DataRegularizacao = CASE
            WHEN @NovoPendente <= 0 THEN GETDATE()
            ELSE DataRegularizacao
          END,
          MovimentoContabilisticoRegularizacaoId = CASE
            WHEN @NovoPendente <= 0 THEN @MovimentoId
            ELSE MovimentoContabilisticoRegularizacaoId
          END
        WHERE Id = @ValorEmFaltaId;
      `);

    res.json({
      success: true,
      message: "Real regularizado com sucesso.",
      valorRegularizado,
      valorPendente: novoPendente
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao regularizar Real."
    });
  }
});

app.post("/api/gestor/guardar-caracterizacao", async (req, res) => {
  try {
    const { utilizadorId, analiseId, movimentos } = req.body;
    const pool = await sql.connect(dbConfig);

    const acesso = await pool.request()
      .input("UtilizadorId", sql.Int, utilizadorId)
      .input("AnaliseId", sql.Int, analiseId)
      .query(`
        SELECT Id
        FROM AnaliseMensal
        WHERE Id = @AnaliseId
          AND GestorId = @UtilizadorId
          
      `);

    if (acesso.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso ou prazo da análise terminado."
      });
    }

    for (const mov of movimentos) {
      await pool.request()
        .input("AnaliseId", sql.Int, analiseId)
        .input("MovimentoId", sql.Int, mov.movimentoId)
        .input("Tipo", sql.NVarChar, mov.tipo)
        .query(`
          IF EXISTS (
            SELECT 1
            FROM AnaliseMovimento
            WHERE AnaliseId = @AnaliseId
              AND MovimentoId = @MovimentoId
          )
          BEGIN
            UPDATE AnaliseMovimento
            SET
                Tipo = @Tipo,
                DataClassificacao = GETDATE()
            WHERE AnaliseId = @AnaliseId
              AND MovimentoId = @MovimentoId
          END
          ELSE
          BEGIN
            INSERT INTO AnaliseMovimento (
              AnaliseId,
              MovimentoId,
              Tipo,
              DataClassificacao
            )
            VALUES (
              @AnaliseId,
              @MovimentoId,
              @Tipo,
              GETDATE()
            )
          END
        `);
    }

    res.json({
      success: true,
      message: "Caracterização guardada com sucesso."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao guardar caracterização."
    });
  }
});

app.get("/api/gestor/controlo-economico", async (req, res) => {
  try {
    const { utilizadorId, analiseId } = req.query;
    const pool = await sql.connect(dbConfig);

    const analise = await pool.request()
    .input("UtilizadorId", sql.Int, utilizadorId)
    .input("AnaliseId", sql.Int, analiseId)
    .query(`
      SELECT
        a.Id,
        a.CentroCusto,
        a.Ano,
        a.Mes,
        cc.Descricao,
        cc.Responsavel
      FROM AnaliseMensal a
      LEFT JOIN CentroCusto cc
        ON cc.CentroCusto = a.CentroCusto
      WHERE a.Id = @AnaliseId
        AND a.GestorId = @UtilizadorId
    `);

    if (analise.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Sem acesso à análise."
      });
    }

    const a = analise.recordset[0];

    const movimentos = await pool.request()
      .input("AnaliseId", sql.Int, analiseId)
      .input("CentroCusto", sql.NVarChar, a.CentroCusto)
      .input("Ano", sql.Int, a.Ano)
      .input("Mes", sql.Int, a.Mes)
      .query(`
        SELECT
          mc.Id,
          mc.ClasseCusto,
          mc.DescricaoClasseCusto,
          mc.TextoCabecalhoDocumento,
          mc.NumeroDocumentoReferencia,
          mc.ValorMR,
          mc.MoedaRelatorio,

          gc.CodigoGrupo,
          gc.Designacao AS GrupoConta,
          gc.TipoCusto,
          gc.TipoProveito,

          am.Tipo,
          ISNULL(am.ValorAntecipado, 0) AS ValorAntecipado,
          am.MesRegularizacao,
          am.AnoRegularizacao,
          am.Comentario

        FROM MovimentoContabilistico mc
        OUTER APPLY (
          SELECT TOP 1 mp.GrupoContaId
          FROM MapaConta mp
          WHERE
            (
              mp.ContaGenerica NOT LIKE '%*'
              AND mc.ClasseCusto = mp.ContaGenerica
            )
            OR
            (
              mp.ContaGenerica LIKE '%*'
              AND mc.ClasseCusto LIKE REPLACE(mp.ContaGenerica, '*', '') + '%'
            )
        ) mp
        LEFT JOIN GrupoConta gc
          ON gc.Id = mp.GrupoContaId
        LEFT JOIN AnaliseMovimento am
          ON am.MovimentoId = mc.Id
         AND am.AnaliseId = @AnaliseId
        WHERE mc.CentroCusto = @CentroCusto
          AND mc.OrigemFicheiro LIKE '%_' +
              RIGHT('0' + CAST(@Mes AS NVARCHAR), 2) +
              '.' + CAST(@Ano AS NVARCHAR) + '%'
          AND am.Tipo IS NOT NULL
        ORDER BY mc.DataDocumento DESC
      `);

    const sapFixos = [];
    const sapVariaveis = [];
    const acumuladosFixos = [];
    const acumuladosVariaveis = [];

    movimentos.recordset.forEach(m => {
      if (m.ValorAntecipado) {
        if (m.Tipo === "FIXO") acumuladosFixos.push(m);
        if (m.Tipo === "VARIAVEL") acumuladosVariaveis.push(m);
      } else {
        if (m.Tipo === "FIXO") sapFixos.push(m);
        if (m.Tipo === "VARIAVEL") sapVariaveis.push(m);
      }
    });

    res.json({
      success: true,
      analise: a,
      sapFixos,
      sapVariaveis,
      acumuladosFixos,
      acumuladosVariaveis
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erro ao carregar controlo económico."
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor ativo em http://localhost:3000");

  executarImportacaoAutomatica();

  setInterval(() => {
    executarImportacaoAutomatica();
  }, 10 * 60 * 1000); // 10 minutos
});

async function executarImportacaoAutomatica() {
  try {
    console.log("A verificar novos ficheiros...");

    const resultadoMovimentos = await importarMovimentosAutomaticamente();
    console.log("Resultado importação movimentos:", resultadoMovimentos);

    const resultadoNotas = await importarNotasEncomendaAutomaticamente();
    console.log("Resultado importação notas encomenda:", resultadoNotas);

  } catch (error) {
    console.error("Erro na importação automática:", error.message);
  }
}

function extrairPeriodoDoFicheiro(nomeFicheiro) {
  const match = nomeFicheiro.match(/_(\d{2})\.(\d{4})/);

  if (!match) return null;

  return {
    mes: Number(match[1]),
    ano: Number(match[2])
  };
}

async function criarAnalisesMensaisParaFicheiro(pool, nomeFicheiro) {
  const periodo = extrairPeriodoDoFicheiro(nomeFicheiro);

  if (!periodo) {
    console.log(`Não foi possível obter período do ficheiro: ${nomeFicheiro}`);
    return;
  }

  await pool.request()
    .input("NomeFicheiro", sql.NVarChar, nomeFicheiro)
    .input("Ano", sql.Int, periodo.ano)
    .input("Mes", sql.Int, periodo.mes)
    .query(`
      INSERT INTO AnaliseMensal
      (
        GestorId,
        CentroCusto,
        NomeContrato,
        Ano,
        Mes,
        Estado,
        DataLimite
      )
      SELECT DISTINCT
        ucc.UtilizadorId,
        m.CentroCusto,
        cc.Descricao,
        @Ano,
        @Mes,
        'POR_INICIAR',
        DATEFROMPARTS(
          YEAR(DATEADD(MONTH, 1, DATEFROMPARTS(@Ano, @Mes, 1))),
          MONTH(DATEADD(MONTH, 1, DATEFROMPARTS(@Ano, @Mes, 1))),
          7
        )
      FROM MovimentoContabilistico m
      JOIN UtilizadorCentroCusto ucc
        ON ucc.CentroCusto = m.CentroCusto
      JOIN CentroCusto cc
        ON cc.CentroCusto = m.CentroCusto
      WHERE m.OrigemFicheiro = @NomeFicheiro
        AND NOT EXISTS (
          SELECT 1
          FROM AnaliseMensal a
          WHERE a.GestorId = ucc.UtilizadorId
            AND a.CentroCusto = m.CentroCusto
            AND a.Ano = @Ano
            AND a.Mes = @Mes
        );
    `);
}


async function importarCentrosCustoAutomaticamente() {
  const pool = await sql.connect(dbConfig);
  const pasta = await obterPastaDados(pool);

  const ficheiro = "Lista CC 2.xlsx";

  if (!ficheiro) {
    throw new Error("Ficheiro de centros de custo não encontrado.");
  }

  const caminho = path.join(pasta, ficheiro);
  const workbook = XLSX.readFile(caminho);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const linhas = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
    range: 4
  });

  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const linha of linhas) {
    const centroCusto = String(linha["Centro custo"] ?? "").trim();

    if (!centroCusto) {
      ignorados++;
      continue;
    }

    const descricao = String(linha["Descrição"] ?? "Centro a definir").trim();
    const responsavel = String(linha["Responsável"] ?? "Responsável a definir").trim();
    const areaHierarquia = String(linha["Área de hierarquia"] ?? "Área a definir").trim();

    const existe = await pool.request()
      .input("CentroCusto", sql.NVarChar, centroCusto)
      .query(`
        SELECT CentroCusto
        FROM CentroCusto
        WHERE CentroCusto = @CentroCusto
      `);

    if (existe.recordset.length > 0) {
      await pool.request()
        .input("CentroCusto", sql.NVarChar, centroCusto)
        .input("Descricao", sql.NVarChar, descricao)
        .input("Responsavel", sql.NVarChar, responsavel)
        .input("AreaHierarquia", sql.NVarChar, areaHierarquia)
        .query(`
          UPDATE CentroCusto
          SET
            Descricao = @Descricao,
            Responsavel = @Responsavel,
            AreaHierarquia = @AreaHierarquia
          WHERE CentroCusto = @CentroCusto
        `);

      atualizados++;
    } else {
      await pool.request()
        .input("CentroCusto", sql.NVarChar, centroCusto)
        .input("Descricao", sql.NVarChar, descricao)
        .input("Responsavel", sql.NVarChar, responsavel)
        .input("AreaHierarquia", sql.NVarChar, areaHierarquia)
        .query(`
          INSERT INTO CentroCusto (
            CentroCusto,
            Descricao,
            Responsavel,
            AreaHierarquia
          )
          VALUES (
            @CentroCusto,
            @Descricao,
            @Responsavel,
            @AreaHierarquia
          )
        `);

      inseridos++;
    }
  }

  return {
    ficheiro,
    totalLinhas: linhas.length,
    inseridos,
    atualizados,
    ignorados
  };
}