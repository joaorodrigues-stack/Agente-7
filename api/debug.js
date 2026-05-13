const BLING_TOKEN = "47bb8d39a61e8aea792f508f6c243c51d93ba9bc5c216232a25fa562fe6192fb0adda5b2";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const resultados = {};

  // Teste 1 - produtos simples
  try {
    const r = await fetch(`https://www.bling.com.br/Api/v2/produtos/json/?apikey=${BLING_TOKEN}`, { method: "GET" });
    const text = await r.text();
    resultados.produtos_status = r.status;
    resultados.produtos_raw = text.slice(0, 500);
    try { resultados.produtos_json = JSON.parse(text); } catch {}
  } catch(e) { resultados.produtos_erro = e.message; }

  // Teste 2 - verificar token (info da conta)
  try {
    const r2 = await fetch(`https://www.bling.com.br/Api/v2/situacoes/modulo/produtos/json/?apikey=${BLING_TOKEN}`);
    const text2 = await r2.text();
    resultados.situacoes_status = r2.status;
    resultados.situacoes_raw = text2.slice(0, 300);
  } catch(e) { resultados.situacoes_erro = e.message; }

  // Teste 3 - contatos
  try {
    const r3 = await fetch(`https://www.bling.com.br/Api/v2/contatos/json/?apikey=${BLING_TOKEN}`);
    const text3 = await r3.text();
    resultados.contatos_status = r3.status;
    resultados.contatos_raw = text3.slice(0, 300);
  } catch(e) { resultados.contatos_erro = e.message; }

  return res.status(200).json(resultados);
}
