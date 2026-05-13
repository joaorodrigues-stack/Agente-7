const BLING_TOKEN = "47bb8d39a61e8aea792f508f6c243c51d93ba9bc5c216232a25fa562fe6192fb0adda5b2";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzXuh4wKQPOLDQuLiQIpeI2gmNNv81ya87wbm89Hm8TNUkMq3vfFrzwrAmG78GTTYg/exec";
const GDRIVE_FOLDER_ID = "1dXNZF25rMs-5ASG8PNv3-4scd7UcR2ot";
const VENDEDOR_NOME = "João Pedro Rodrigues dos Santos";

function blingUrl(endpoint) {
  return `https://www.bling.com.br/Api/v2/${endpoint}/json/?apikey=${BLING_TOKEN}`;
}

function xmlProduto(nome, valor, base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<produto>
  <descricao>${nome}</descricao>
  <preco>${parseFloat(valor).toFixed(2)}</preco>
  <tipo>${base?.tipo || "P"}</tipo>
  <situacao>Ativo</situacao>
  <formato>${base?.formato || "S"}</formato>
  <unidade>${base?.unidade || "UN"}</unidade>
</produto>`;
}

function xmlProposta(cliente, produtoId, descricao, qtd, valor, obs) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<proposta>
  <cliente>
    <nome>${cliente}</nome>
  </cliente>
  <vendedor>${VENDEDOR_NOME}</vendedor>
  <itens>
    <item>
      <codigo>${produtoId}</codigo>
      <descricao>${descricao}</descricao>
      <qtde>${parseInt(qtd)}</qtde>
      <vlr_unit>${parseFloat(valor).toFixed(2)}</vlr_unit>
    </item>
  </itens>
  <obs>${obs}</obs>
</proposta>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

  const { cliente, largura, altura, profundidade, quantidade, valor } = req.body;
  if (!cliente || !largura || !altura || !profundidade || !quantidade || !valor)
    return res.status(400).json({ erro: "Campos obrigatórios faltando" });

  const logs = [];
  const erros = [];
  const log = (msg, tipo = "info") => logs.push({ msg, tipo });
  const nomePasta = `Orçamento - ${cliente} - ${new Date().toLocaleDateString("pt-BR")}`;
  const nomeProduto = `${cliente} - ${largura}x${altura}x${profundidade}cm`;

  let resultado = { drive: null, produto: null, proposta: null };

  // ─── 1. Buscar primeiro produto no Bling v2 ───────────────────────────────
  log("🔍 Buscando produto base no Bling...");
  let produtoBase = null;
  try {
    const r = await fetch(blingUrl("produtos") + "&estoque=S&situacao=A&limite=1", {
      method: "GET",
    });
    const data = await r.json();
    const lista = data?.retorno?.produtos;
    if (!lista || lista.length === 0) throw new Error("Nenhum produto ativo encontrado");
    produtoBase = lista[0].produto;
    log(`✅ Produto base: "${produtoBase.descricao}"`, "sucesso");
  } catch (e) {
    // Tenta sem filtros
    try {
      const r2 = await fetch(blingUrl("produtos"), { method: "GET" });
      const data2 = await r2.json();
      const lista2 = data2?.retorno?.produtos;
      if (!lista2 || lista2.length === 0) throw new Error("Nenhum produto encontrado no Bling");
      produtoBase = lista2[0].produto;
      log(`✅ Produto base: "${produtoBase.descricao}"`, "sucesso");
    } catch (e2) {
      log(`❌ ${e2.message}`, "erro");
      erros.push(e2.message);
      return res.status(500).json({ sucesso: false, logs, erros });
    }
  }

  // ─── 2. Criar novo produto (clone) ────────────────────────────────────────
  log(`📦 Criando produto: "${nomeProduto}"...`);
  let novoProdutoCodigo = null;
  try {
    const xml = xmlProduto(nomeProduto, valor, produtoBase);
    const r = await fetch(blingUrl("produto"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ xml }),
    });
    const data = await r.json();
    const prod = data?.retorno?.produtos?.[0]?.produto;
    if (!prod) throw new Error(JSON.stringify(data?.retorno?.erros || data));
    novoProdutoCodigo = prod.codigo || prod.id;
    log(`✅ Produto criado (código: ${novoProdutoCodigo})`, "sucesso");
    resultado.produto = { id: novoProdutoCodigo, nome: nomeProduto };
  } catch (e) {
    log(`❌ Erro ao criar produto: ${e.message}`, "erro");
    erros.push(`Produto: ${e.message}`);
    return res.status(500).json({ sucesso: false, logs, erros });
  }

  // ─── 3. Criar proposta comercial ─────────────────────────────────────────
  log(`📋 Criando proposta para "${cliente}"...`);
  try {
    const xml = xmlProposta(cliente, novoProdutoCodigo, nomeProduto, quantidade, valor, `Pasta Drive: ${nomePasta}`);
    const r = await fetch(blingUrl("proposta"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ xml }),
    });
    const data = await r.json();
    const prop = data?.retorno?.propostas?.[0]?.proposta;
    if (!prop) throw new Error(JSON.stringify(data?.retorno?.erros || data));
    const numero = prop.numero || prop.id;
    log(`✅ Proposta nº ${numero} criada com vendedor ${VENDEDOR_NOME}!`, "sucesso");
    resultado.proposta = { numero: String(numero) };
  } catch (e) {
    log(`❌ Erro ao criar proposta: ${e.message}`, "erro");
    erros.push(`Proposta: ${e.message}`);
  }

  // ─── 4. Criar pasta no Google Drive ──────────────────────────────────────
  log(`📁 Criando pasta no Drive: "${nomePasta}"...`);
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente, data: new Date().toLocaleDateString("pt-BR"), pastaId: GDRIVE_FOLDER_ID }),
    });
    if (r.ok) {
      const data = await r.json();
      resultado.drive = { nome: data.nome || nomePasta, id: data.id || "ok" };
    } else {
      throw new Error("Apps Script retornou erro");
    }
  } catch {
    // fallback no-cors
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente, data: new Date().toLocaleDateString("pt-BR"), pastaId: GDRIVE_FOLDER_ID }),
    }).catch(() => {});
    resultado.drive = { nome: nomePasta, id: "enviado" };
  }
  log(`✅ Pasta "${resultado.drive.nome}" criada no Drive!`, "sucesso");

  log("🎉 Processo concluído!", "sucesso");

  return res.status(200).json({
    sucesso: true,
    ...resultado,
    erros,
    logs,
    valorTotal: (parseFloat(valor) * parseInt(quantidade)).toFixed(2),
  });
}
