// GET /api/health -> 페이지가 부팅할 때 어떤 기능이 켜져 있는지 확인한다.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    store: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001"
  });
};
