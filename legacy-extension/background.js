const DEFAULTS = {
  baseUrl: "https://api.anthropic.com",
  model: "claude-haiku-5-5",
  apiKey: ""
};

const SYSTEM = `你是抖音评论区的回怼高手。用户会给你一条评论(可能附视频文案),你要替用户写几条能直接发出去的回复。
要求:
- 每条 40 字以内,口语化,像真人在评论区打字,不要书面腔,不要解释。
- 抓住对方话里的逻辑漏洞、矛盾或离谱之处反击,打观点,不打人。
- 不用脏话,不攻击对方的地域、性别、外貌、疾病、家人等身份特征,不威胁,不泄露隐私。
- 三条风格要有区别,具体风格见用户指定。
只输出 JSON 数组,例如 ["回复1","回复2","回复3"],不要任何别的文字。`;

async function generate({ comment, desc, style, stance, count }) {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  if (!cfg.apiKey) throw new Error("还没填 API Key,点扩展图标 → 选项 去填。");
  const user = [
    desc ? `视频文案:${desc}` : "",
    `对方评论:${comment}`,
    `回怼风格:${style}`,
    stance ? `我的立场/想表达的意思:${stance}` : "",
    `请给出 ${count} 条。`
  ].filter(Boolean).join("\n");

  const res = await fetch(cfg.baseUrl.replace(/\/$/, "") + "/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!res.ok) throw new Error(`接口返回 ${res.status}:${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || "").join("");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("模型返回格式不对:" + text.slice(0, 100));
  return JSON.parse(m[0]);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "generate") return;
  generate(msg.payload)
    .then(replies => sendResponse({ ok: true, replies }))
    .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
  return true; // 异步响应
});
