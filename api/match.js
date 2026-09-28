// POST /api/match  { text }  ->  { card: 7 } | { none: true } | { clarify: "..." }
// 요청 문장을 Claude가 읽고 카드 30장 중 하나에 연결한다. 실패하면 클라이언트가 사전 매칭으로 후퇴한다.
const data = require("../data/cards.json");

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

function buildSystem() {
  const list = data.cards.map(c => `${c.n}. [${c.title}] ${c.body}`).join("\n");
  const none = data.noInfo.map(g => g[0]).join(", ");
  return `당신은 기업교육 시뮬레이션의 자료 담당자입니다. 교육생 팀이 "알고 싶은 정보"를 문장으로 요청하면, 아래 정보 카드 30장 중 정확히 하나를 골라 주거나, 해당 카드가 없다고 답하거나, 요청이 너무 넓으면 되묻습니다.

판단 규칙:
1. 요청이 카드 한 장에 분명히 대응하면 그 카드 번호를 돌려준다. 카드 본문에 답이 들어 있으면 대응하는 것으로 본다.
2. 요청이 여러 카드에 걸치거나 범위가 넓으면(예: "지연률 자료", "협력사 정보", "자재 관련") 되묻는다. 되물을 때는 어떤 카드들이 후보인지 제목 수준으로 2~4개 보기를 주고 한 가지로 좁혀 달라고 한다. 카드 번호는 말하지 않는다.
3. 다음은 회사에 없는 정보다: ${none}. 이런 요청은 none으로 답한다. 카드 30장 어디에도 없는 정보도 none이다.
4. "원인이 뭐냐", "왜 그러냐" 같은 판단 요청은 되묻는다: 원인은 팀이 찾아야 하며 확인하고 싶은 사실 한 가지를 요청하라고.
5. 절대 카드 본문이나 정답을 설명하지 않는다. 카드 선택만 한다.

정보 카드:
${list}

반드시 JSON 한 줄로만 답한다. 형식: {"card": 번호} 또는 {"none": true} 또는 {"clarify": "되묻는 문장"}`;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "no-api-key" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = String((body && body.text) || "").trim().slice(0, 300);
  if (text.length < 2) return res.status(400).json({ error: "empty" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        temperature: 0,
        system: buildSystem(),
        messages: [{ role: "user", content: `팀의 요청: "${text}"` }]
      })
    });
    clearTimeout(timer);
    if (!r.ok) return res.status(502).json({ error: "upstream", status: r.status });
    const j = await r.json();
    const out = (j.content || []).map(c => c.text || "").join("");
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return res.status(502).json({ error: "bad-format" });
    const parsed = JSON.parse(m[0]);
    if (parsed.card) {
      const n = Number(parsed.card);
      if (!data.cards.find(c => c.n === n)) return res.status(502).json({ error: "bad-card" });
      return res.json({ card: n });
    }
    if (parsed.clarify) return res.json({ clarify: String(parsed.clarify).slice(0, 200) });
    return res.json({ none: true });
  } catch (e) {
    clearTimeout(timer);
    return res.status(504).json({ error: "timeout" });
  }
};
