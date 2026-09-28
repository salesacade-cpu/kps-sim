// 팀 기록과 진행 단계를 Upstash Redis(REST)에 저장한다.
//   GET  /api/state?kind=teams            -> { teams: {no: team} }
//   POST /api/state?kind=teams  {team}    -> 팀 기록 저장 (팀 화면)
//   GET  /api/state?kind=session          -> { phase }
//   POST /api/state?kind=session {phase}  -> 단계 변경 (강사, x-pin 필요)
//   POST /api/state?kind=reset            -> 전체 초기화 (강사, x-pin 필요)
// Upstash 환경변수가 없으면 { ok:false, reason:"no-store" } 를 돌려주고 페이지는 결과 코드 방식으로 후퇴한다.

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.INSTRUCTOR_PIN || "2026";
const NS = process.env.SIM_NAMESPACE || "kps-sim";

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.json({ ok: false, reason: "no-store" });
  const kind = (req.query && req.query.kind) || "teams";
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (kind === "teams") {
      if (req.method === "GET") {
        const h = await redis(["HGETALL", `${NS}:teams`]);
        const teams = {};
        for (let i = 0; i < (h || []).length; i += 2) { try { const t = JSON.parse(h[i + 1]); teams[t.no] = t; } catch {} }
        return res.json({ ok: true, teams });
      }
      if (req.method === "POST") {
        const t = body.team;
        if (!t || !t.no || !t.name) return res.status(400).json({ error: "bad-team" });
        const slim = { no: t.no, name: String(t.name).slice(0, 40), phase: t.phase, startedAt: t.startedAt, submittedAt: t.submittedAt, registeredAt: t.registeredAt, requests: (t.requests || []).slice(0, 40), report: t.report || null, updatedAt: Date.now() };
        await redis(["HSET", `${NS}:teams`, String(t.no), JSON.stringify(slim)]);
        return res.json({ ok: true });
      }
    }
    if (kind === "session") {
      if (req.method === "GET") {
        const v = await redis(["GET", `${NS}:session`]);
        return res.json({ ok: true, phase: v || "free" });
      }
      if (req.method === "POST") {
        if (req.headers["x-pin"] !== PIN) return res.status(403).json({ error: "pin" });
        const p = String(body.phase || "free");
        if (!["free", "brief", "req", "report", "reveal"].includes(p)) return res.status(400).json({ error: "bad-phase" });
        await redis(["SET", `${NS}:session`, p]);
        return res.json({ ok: true, phase: p });
      }
    }
    if (kind === "reset" && req.method === "POST") {
      if (req.headers["x-pin"] !== PIN) return res.status(403).json({ error: "pin" });
      await redis(["DEL", `${NS}:teams`]);
      await redis(["SET", `${NS}:session`, "free"]);
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "store", message: String(e.message || e) });
  }
};
