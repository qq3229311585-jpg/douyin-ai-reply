// ==UserScript==
// @name         抖音评论 AI 怼
// @namespace    local.douyin-ai-reply
// @version      1.0.3
// @description  抖音网页版评论区悬浮「AI 怼」按钮:读完整楼对话,生成回怼,点选后填入回复框(不会自动发送)
// @match        https://www.douyin.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";
  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- 设置(存在油猴本地,不写进代码) ----------
  const DEF = { apiKey: "", model: "deepseek-chat", baseUrl: "https://api.deepseek.com", me: "" };
  const cfg = () => ({
    apiKey: GM_getValue("apiKey", DEF.apiKey), model: GM_getValue("model", DEF.model),
    baseUrl: GM_getValue("baseUrl", DEF.baseUrl), me: GM_getValue("me", DEF.me)
  });
  GM_registerMenuCommand("设置 API Key", () => {
    const v = prompt("粘贴 API Key(DeepSeek 或 Anthropic 的都行,只存在本机油猴里):", cfg().apiKey);
    if (v !== null) GM_setValue("apiKey", v.trim());
  });
  GM_registerMenuCommand("设置我的抖音昵称(让 AI 认出哪句是你说的)", () => {
    const v = prompt("你的抖音昵称(要和评论区里显示的一模一样):", cfg().me);
    if (v !== null) GM_setValue("me", v.trim());
  });
  GM_registerMenuCommand("设置模型 / 接口地址", () => {
    const c = cfg();
    const m = prompt("模型(DeepSeek 用 deepseek-chat;Claude 用 claude-haiku-5-5):", c.model);
    if (m !== null) GM_setValue("model", m.trim() || DEF.model);
    const u = prompt("接口地址(DeepSeek: https://api.deepseek.com ;Claude: https://api.anthropic.com):", c.baseUrl);
    if (u !== null) GM_setValue("baseUrl", u.trim() || DEF.baseUrl);
  });

  // ---------- 人设 ----------
  const SYSTEM = `你是抖音评论区里最会怼人的老手,替用户写能直接发出去的回复。
风格:狠、准、毒舌。专挑对方话里的逻辑漏洞、前后矛盾、自相打脸、双标和外行硬装内行下手,用反问、反讽、拆台、一针见血的短句把对方怼到没话说。要有杀伤力和梗,不要客气,不要和稀泥,不要讲大道理。
格式:每条 40 字以内,口语化,像真人在评论区手打的,不要书面腔,不要解释,不要带引号。
底线(为了不被举报封号,也为了怼得更高级):只打观点、言行和水平,不骂脏话,不攻击对方的地域、性别、外貌、疾病、家人、民族等身份特征,不威胁,不人肉。
你会拿到视频背景和一整楼的对话原文(按顺序编号)。你知道用户的抖音昵称,对话里标【我】的就是用户本人,标【视频作者】的是发视频的人,其余是路人;别把我说的话当成对方说的。要认真读完前因后果,记住双方每一轮说了什么,别重复我已经说过的话,要接住对方最新一句,把他的话反过来用。
动笔前先搞清楚三件事:①这个视频到底在讲什么;②这一楼在争什么、双方各自的立场和争论焦点;③对方最新一句的破绽在哪。回怼必须紧扣这个视频和这一楼的具体话题与细节,不要写放在哪都能用的空话。
只输出 JSON 对象,格式:{"topic":"一句话说明:视频讲什么 + 这一楼在争什么(30字内)","replies":["回复1","回复2","回复3"]},不要任何别的文字。`;

  // ---------- 调接口:地址含 anthropic 用 Claude 格式,其余走 OpenAI 兼容格式(DeepSeek 等) ----------
  function generate(userMsg) {
    const c = cfg();
    return new Promise((resolve, reject) => {
      if (!c.apiKey) return reject(new Error("还没填 API Key:点浏览器工具栏的油猴图标 → 本脚本 → 设置 API Key"));
      const base = c.baseUrl.replace(/\/$/, "");
      const claude = /anthropic\.com/.test(base);
      const req = claude ? {
        url: base + "/v1/messages",
        headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01" },
        body: { model: c.model, max_tokens: 700, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }
      } : {
        url: base + "/chat/completions",
        headers: { "content-type": "application/json", authorization: "Bearer " + c.apiKey },
        body: { model: c.model, max_tokens: 700, temperature: 1.2, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }] }
      };
      GM_xmlhttpRequest({
        method: "POST", url: req.url, headers: req.headers, data: JSON.stringify(req.body), timeout: 45000,
        onload: r => {
          if (r.status < 200 || r.status >= 300) return reject(new Error(`接口返回 ${r.status}:${String(r.responseText).slice(0, 200)}`));
          try {
            const d = JSON.parse(r.responseText);
            const text = claude ? (d.content || []).map(b => b.text || "").join("") : (d.choices?.[0]?.message?.content || "");
            const o = text.match(/\{[\s\S]*\}/), a = text.match(/\[[\s\S]*\]/);
            let res = null;
            try { if (o) { const j = JSON.parse(o[0]); if (Array.isArray(j.replies)) res = { topic: String(j.topic || ""), replies: j.replies }; } } catch {}
            if (!res && a) res = { topic: "", replies: JSON.parse(a[0]) };
            if (!res) throw new Error("模型返回格式不对:" + text.slice(0, 100));
            resolve(res);
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error("网络错误:连不上接口地址")),
        ontimeout: () => reject(new Error("请求超时"))
      });
    });
  }

  // ---------- 读整楼对话 ----------
  const TIME_RE = /(刚刚|\d+\s*(分钟|小时|天|周|个月|月|年)前|\d{4}-\d{1,2}-\d{1,2}|昨天|前天)/;
  const NOISE = /^(\.\.\.|分享|回复|回复中|收起|作者|作者赞过|作者回复过|置顶|热评|展开\d*条?回复.*|展开更多.*)$/;
  const ITEM = '[data-e2e="comment-item"]';

  // 自动点开所有"展开N条回复/展开更多",直到整楼读全(和你自己一直点一样)
  async function expandThread(item) {
    let stall = 0;
    for (let i = 0; i < 30; i++) {
      const b = [...item.querySelectorAll("button")].find(e => /^展开(\d+条)?回复|^展开更多|^查看更多/.test(e.textContent.trim()));
      if (!b) break;
      const before = item.innerText.length;
      b.click(); await sleep(700);
      if (item.innerText.length === before) { if (++stall >= 2) break; } else stall = 0;
    }
  }

  // innerText 结构:昵称 / (作者) / 正文 / (作者赞过) / "1月前·地区" / 点赞数 / 分享 / 回复 / (下一条的昵称…)
  function parseThread(item) {
    const lines = item.innerText.split("\n").map(s => s.trim()).filter(Boolean);
    const msgs = []; let buf = [], cur = null, afterTime = false, isAuthor = false, liked = false;
    for (const l of lines) {
      if (afterTime) {
        if (cur && cur.likes == null && /^\d+(\.\d+)?[万wW]?$/.test(l)) { cur.likes = l; continue; }
        if (NOISE.test(l) || /^\d+(\.\d+)?[万wW]?$/.test(l)) continue;
        afterTime = false;
      }
      if (l === "作者") { isAuthor = true; continue; }
      if (l === "作者赞过") { liked = true; continue; }
      if (NOISE.test(l)) continue;
      if (TIME_RE.test(l) && /·|前$/.test(l) && l.length < 24) {
        if (buf.length) {
          cur = { nick: buf[0], text: buf.slice(1).join(" "), loc: (l.split("·")[1] || "").trim(), author: isAuthor, liked, likes: null };
          msgs.push(cur);
        }
        buf = []; isAuthor = false; liked = false; afterTime = true; continue;
      }
      buf.push(l);
    }
    return msgs;
  }

  function threadText(msgs) {
    const me = cfg().me;
    const t = msgs.map((m, i) => {
      const label = me && m.nick === me ? "【我】" : m.nick + (m.author ? "【视频作者】" : "");
      const meta = [m.loc, m.likes ? m.likes + "赞" : "", m.liked ? "视频作者赞过" : ""].filter(Boolean).join(",");
      return `${i + 1}. ${label}${meta ? `(${meta})` : ""}:${m.text}`;
    }).join("\n");
    return t.length > 6000 ? t.split("\n")[0] + "\n(中间略)\n" + t.slice(-5500) : t;
  }

  // 推荐流里页面上同时挂着好几个视频,而且"当前视频"的标记在切视频时会滞后(评论已经是新视频的了,标记还留在上一个)。
  // 所以不看标记,直接找"这条评论所在的那一格视频"(评论列表就挂在它自己的视频格子里)。找不到才退回到标记。
  function videoRoot(item) {
    return (item && (item.closest("[data-e2e-vid]") || item.closest('[data-e2e="feed-active-video"]'))) || document.querySelector('[data-e2e="feed-active-video"]') || (item && item.closest('[data-e2e="modal-video-container"]')) || document;
  }
  function videoAuthor(item) {
    const a = videoRoot(item).querySelector('[data-e2e="feed-video-nickname"]');
    return a ? a.innerText.replace(/^@/, "").trim() : "";
  }
  function videoDesc(item) {
    const d = videoRoot(item).querySelector('[data-e2e="video-desc"]');
    const t = d ? d.innerText.replace(/\s*展开$/, "").trim() : "";
    return (t || document.title.replace(/\s*-\s*抖音.*$/, "").trim()).slice(0, 600);
  }

  // 当前视频的 aweme_id:推荐流/弹窗里 feed-active-video 带 data-e2e-vid;再不行用网址里的 modal_id
  function videoId(item) {
    const r = videoRoot(item);
    const byClass = (String(r.className || "").match(/video_(\d+)/) || [])[1];
    return (r.getAttribute && r.getAttribute("data-e2e-vid")) || byClass || new URL(location.href).searchParams.get("modal_id") || "";
  }
  const mmss = ms => { const t = Math.floor((+ms || 0) / 1000); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
  const infoCache = new Map();

  // 视频信息:先读页面(作者/文案),再调抖音自己的同源详情接口补全(AI 总结、分章节要点、分类、合集…)。接口失败就只用页面信息。
  async function videoInfo(item) {
    const id = videoId(item);
    const info = { author: videoAuthor(item), desc: videoDesc(item), tags: "", mix: "", music: "", date: "", summary: "", chapters: "" };
    if (!id) return info;
    if (infoCache.has(id)) return { ...infoCache.get(id), author: info.author || infoCache.get(id).author, desc: info.desc || infoCache.get(id).desc };
    try {
      const r = await fetch(`/aweme/v1/web/aweme/detail/?aweme_id=${id}&aid=6383`, { credentials: "include" });
      if (!r.ok) throw new Error(r.status);
      const d = (await r.json()).aweme_detail;
      if (!d) throw new Error("no detail");
      const ch = d.recommend_chapter_info || {};
      const full = {
        author: info.author || (d.author && d.author.nickname) || "",
        desc: info.desc || d.desc || "",
        tags: (d.video_tag || []).map(t => t.tag_name).filter(Boolean).join("、"),
        mix: (d.mix_info && d.mix_info.mix_name) || "",
        music: (d.music && d.music.title) || "",
        date: d.create_time ? new Date(d.create_time * 1000).toLocaleDateString("zh-CN") : "",
        summary: String(ch.chapter_abstract || "").slice(0, 500),
        chapters: (ch.recommend_chapter_list || []).map(c => `${mmss(c.timestamp)} ${c.desc || ""}${c.detail ? ":" + c.detail : ""}`).join("\n").slice(0, 1200)
      };
      infoCache.set(id, full);
      return full;
    } catch { return info; }
  }

  // 同一个评论列表里其他人的评论(只取每楼第一条),让 AI 知道大家都在聊什么
  function otherComments(item) {
    const list = item.closest('[data-e2e="comment-list"]') || document;
    return [...list.querySelectorAll(ITEM)].filter(e => e !== item).slice(0, 8).map(e => {
      const m = parseThread(e)[0];
      return m ? `- ${m.nick}:${m.text.slice(0, 70)}` : "";
    }).filter(Boolean).join("\n");
  }

  // ---------- 填入回复框(只填不发) ----------
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "dyai-toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
  }
  async function insertIntoBox(box, text) {
    const val = () => box.innerText.replace(/\n$/, "");
    box.focus();
    const dt = new W.DataTransfer(); dt.setData("text/plain", text);
    box.dispatchEvent(new W.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(200);
    if (!val()) { box.focus(); document.execCommand("insertText", false, text); await sleep(200); }
    if (val() === text + text) {
      const sel = getSelection();
      for (let i = 0; i < text.length; i++) sel.modify("extend", "backward", "character");
      document.execCommand("delete"); await sleep(150);
    }
    return val() === text;
  }
  async function fillAndCopy(item, text) {
    try { await navigator.clipboard.writeText(text); } catch {}
    try {
      const rb = [...item.querySelectorAll("span,div,button")].find(e => e.children.length === 0 && e.textContent.trim() === "回复");
      rb?.click(); await sleep(500);
      const box = document.querySelector('.public-DraftEditor-content[contenteditable="true"]');
      if (box && await insertIntoBox(box, text)) return;
    } catch {}
    toast("没能自动填入,已复制到剪贴板,点「回复」后粘贴即可");
  }

  // ---------- 悬浮 UI:全挂 body、fixed 定位,不动抖音原节点 ----------
  const st = document.createElement("style");
  st.textContent = `
#dyai-btn,#dyai-panel,.dyai-toast{all:initial;box-sizing:border-box;font:12.5px/1.65 "SF Mono",ui-monospace,Menlo,Monaco,"PingFang SC","Microsoft YaHei",monospace;-webkit-font-smoothing:antialiased}
#dyai-btn,#dyai-panel,.dyai-toast{--bg:#141416;--bg2:#1d1d21;--bd:#2b2b30;--bd2:#3a3a42;--fg:#d6d6da;--tx:#bdbdc4;--mu:#74747c;--dm:#5d5d66;--ac:#7dcfff;--err:#ff7b72}

/* 悬浮按钮 */
#dyai-btn{position:fixed;z-index:2147483000;display:none;height:24px;padding:0 10px;border-radius:6px;background:var(--bg);color:var(--fg);border:1px solid var(--bd2);font-size:12px;line-height:22px;white-space:nowrap;cursor:pointer;user-select:none;box-shadow:0 6px 18px rgba(0,0,0,.45);transition:transform .14s ease,background-color .14s ease,box-shadow .14s ease;animation:dyai-pop .12s ease-out}
#dyai-btn::before{content:"❯";color:var(--ac);margin-right:6px}
#dyai-btn:hover{transform:scale(1.1);background:var(--bg2);box-shadow:0 8px 22px rgba(0,0,0,.55)}
#dyai-btn:active{transform:scale(.96)}

/* 面板 */
#dyai-panel{position:fixed;z-index:2147483001;display:none;width:320px;max-width:calc(100vw - 16px);max-height:70vh;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:0 12px 12px;border-radius:10px;background:var(--bg);color:var(--fg);border:1px solid var(--bd);box-shadow:0 14px 34px rgba(0,0,0,.55);scrollbar-width:thin;scrollbar-color:var(--bd2) transparent;animation:dyai-in .14s ease-out}
#dyai-panel *{all:revert;box-sizing:border-box;font:inherit;color:inherit;margin:0;min-width:0}

/* 标题栏 */
#dyai-panel .dyai-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;margin:0 -12px 6px;padding:10px 10px 4px 12px;background:var(--bg)}
#dyai-panel .dyai-title{color:var(--fg);font-weight:600;white-space:nowrap}
#dyai-panel .dyai-title::before{content:"●";color:var(--ac);font-size:8px;margin-right:7px;vertical-align:2px}
#dyai-panel .dyai-tools{display:flex;flex:none;gap:2px}
#dyai-panel .dyai-gear,#dyai-panel .dyai-x{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--mu);font-size:12px;line-height:1;cursor:pointer;transition:color .12s ease,background-color .12s ease}
#dyai-panel .dyai-gear:hover,#dyai-panel .dyai-x:hover{color:var(--fg);background:var(--bg2)}

/* 设置区 */
#dyai-panel .dyai-set{display:none;margin:4px 0 10px;padding:10px;border-radius:6px;background:var(--bg2);border:1px solid var(--bd)}
#dyai-panel .dyai-tip{margin-bottom:8px;font-size:12px;line-height:1.6;color:var(--mu)}
#dyai-panel .dyai-set input{display:block;width:100%;height:30px;margin-bottom:8px;padding:0 10px;border:1px solid var(--bd2);border-radius:6px;background:var(--bg);color:var(--fg);font-size:12px;outline:none;transition:border-color .12s ease}
#dyai-panel .dyai-set input::placeholder{color:var(--dm)}
#dyai-panel .dyai-set input:focus{border-color:var(--ac)}
#dyai-panel .dyai-set .dyai-save{display:block;width:100%;height:30px;margin:0}

/* 提示符输入行 */
#dyai-panel .dyai-in{display:flex;align-items:center;gap:8px;padding:6px 0 8px;border-bottom:1px solid #26262b}
#dyai-panel .dyai-in i{flex:none;font-style:normal;color:var(--ac)}
#dyai-panel .dyai-stance{flex:1;width:100%;height:22px;padding:0;border:0;background:transparent;color:var(--fg);font-size:12.5px;outline:none;caret-color:var(--ac)}
#dyai-panel .dyai-stance::placeholder{color:var(--dm)}

/* 风格 + 生成 */
#dyai-panel .dyai-ctl{display:flex;align-items:center;justify-content:space-between;margin:9px 0 4px}
#dyai-panel .dyai-seg{display:flex;gap:12px}
#dyai-panel .dyai-opt{padding:0;border:0;background:none;color:var(--dm);font-size:12.5px;line-height:1.65;cursor:pointer;transition:color .12s ease}
#dyai-panel .dyai-opt:hover{color:var(--fg)}
#dyai-panel .dyai-opt.on{color:var(--ac)}
#dyai-panel .dyai-go{height:24px;padding:0 10px;border:1px solid var(--bd2);border-radius:6px;background:transparent;color:var(--fg);font-size:12.5px;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,color .12s ease,border-color .12s ease,transform .08s ease}
#dyai-panel .dyai-go:hover{background:var(--ac);border-color:var(--ac);color:var(--bg)}
#dyai-panel .dyai-go:active{transform:translateY(1px)}
#dyai-panel .dyai-go[disabled]{opacity:.4;cursor:default;transform:none;background:transparent;color:var(--fg);border-color:var(--bd2)}
#dyai-panel button:focus-visible{outline:1px solid var(--ac);outline-offset:2px}

/* 输出区 */
#dyai-panel .dyai-out{counter-reset:dyai-n}
#dyai-panel .dyai-topic{margin:10px 0 6px;color:var(--mu);font-size:12px;line-height:1.6}
#dyai-panel .dyai-reply{display:grid;grid-template-columns:22px 1fr;padding:5px 8px;border-left:2px solid transparent;color:var(--tx);word-break:break-word;cursor:pointer;user-select:none;transition:background-color .12s ease,color .12s ease,border-color .12s ease;animation:dyai-in .18s ease-out both}
#dyai-panel .dyai-reply::before{counter-increment:dyai-n;content:counter(dyai-n);color:var(--dm)}
#dyai-panel .dyai-reply:hover{background:var(--bg2);border-left-color:var(--ac);color:#fff}
#dyai-panel .dyai-reply:hover::before{content:"›";color:var(--ac)}
#dyai-panel .dyai-reply:focus-visible{outline:1px solid var(--ac)}
#dyai-panel .dyai-reply:nth-child(3){animation-delay:.05s}
#dyai-panel .dyai-reply:nth-child(n+4){animation-delay:.1s}

/* 加载 / 错误 */
#dyai-panel .dyai-msg{padding:8px 8px 4px;color:var(--mu)}
#dyai-panel .dyai-sp{display:inline-block;width:1.2em;color:var(--ac)}
#dyai-panel .dyai-err{margin-top:8px;padding:7px 10px;border-radius:4px;background:var(--bg2);border-left:2px solid var(--err);color:var(--err);font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word}

/* Toast */
.dyai-toast{position:fixed;left:50%;bottom:60px;z-index:2147483002;max-width:calc(100vw - 32px);padding:7px 12px;border-radius:6px;background:var(--bg);color:var(--fg);border:1px solid var(--bd2);font-size:12px;line-height:1.5;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.5);transform:translateX(-50%);pointer-events:none;animation:dyai-toast-in .16s ease-out,dyai-toast-out .2s ease-in 2.18s forwards}

@keyframes dyai-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@keyframes dyai-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes dyai-toast-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translateX(-50%)}}
@keyframes dyai-toast-out{to{opacity:0;transform:translate(-50%,4px)}}
@media (prefers-reduced-motion: reduce){
  #dyai-btn,#dyai-panel,.dyai-toast,#dyai-panel *{animation:none !important;transition:none !important}
  .dyai-toast{transform:translateX(-50%) !important}
}
`;
  document.head.appendChild(st);

  const STYLES = ["狠辣毒舌", "阴阳怪气", "幽默调侃", "以理服人"], SHORT = ["狠辣", "阴阳", "调侃", "讲理"];
  const btn = document.createElement("div"); btn.id = "dyai-btn"; btn.textContent = "AI 怼";
  const panel = document.createElement("div"); panel.id = "dyai-panel";
  document.body.append(btn, panel);

  let curItem = null, panelItem = null, hideTimer = null;

  function placeBtn(item) {
    const r = item.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { btn.style.display = "none"; return; }
    btn.style.display = "block";
    btn.style.top = Math.max(r.top + 4, 4) + "px";
    btn.style.left = Math.max(r.right - btn.offsetWidth - 10, 4) + "px";
  }
  function placePanel() {
    if (!panelItem || !panelItem.isConnected) return closePanel();
    const r = panelItem.getBoundingClientRect(), w = 320;
    let left = r.left - w - 8;
    if (left < 8) left = Math.min(r.right - w, innerWidth - w - 8);
    panel.style.left = left + "px";
    panel.style.top = Math.min(Math.max(r.top, 8), innerHeight - 200) + "px";
  }
  let panelUrl = "";
  function closePanel() { panel.style.display = "none"; panelItem = null; }

  // ---- 自动收回:点面板外面 / 按 Esc / 换了视频 / 评论区关了 / 那条评论滚出视野 ----
  document.addEventListener("mousedown", e => {
    if (panel.style.display === "block" && !panel.contains(e.target) && e.target !== btn) closePanel();
  }, true);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && panel.style.display === "block") { closePanel(); e.stopPropagation(); }
  }, true);
  setInterval(() => {
    if (curItem && btn.style.display === "block" && !isVisible(curItem)) btn.style.display = "none";
    if (panel.style.display !== "block") return;
    if (!panelItem || !isVisible(panelItem) || location.href !== panelUrl) closePanel();
  }, 400);
  function isVisible(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  }

  // 加载转圈(盲文字符)
  let spi = 0;
  setInterval(() => {
    if (panel.style.display !== "block") return;
    spi = (spi + 1) % 10;
    panel.querySelectorAll(".dyai-sp").forEach(e => { e.textContent = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[spi]; });
  }, 80);

  // 抖音有全局快捷键(空格/F/方向键),面板里打字不能冒泡出去
  ["keydown", "keyup", "keypress"].forEach(t => panel.addEventListener(t, e => e.stopPropagation()));

  // 按钮只在鼠标真的移到某条评论上时才出现;一滚动就立刻消失,滚完也不会自己冒出来(浏览器滚完会补发一次原地的鼠标事件,要忽略)
  let calm = false, lastX = -1, lastY = -1;
  document.addEventListener("mousemove", e => {
    if (calm) { if (e.clientX === lastX && e.clientY === lastY) return; calm = false; }
    lastX = e.clientX; lastY = e.clientY;
    if (e.target === btn || panel.contains(e.target)) { clearTimeout(hideTimer); return; }
    const item = e.target.closest && e.target.closest(ITEM);
    clearTimeout(hideTimer);
    if (item) { if (item !== curItem || btn.style.display !== "block") { curItem = item; placeBtn(item); } }
    else hideTimer = setTimeout(() => { btn.style.display = "none"; }, 400);
  }, true);
  addEventListener("scroll", e => {
    if (!panel.contains(e.target)) { calm = true; btn.style.display = "none"; }
    if (panel.style.display === "block") placePanel();
  }, true);
  addEventListener("resize", () => { if (panel.style.display === "block") placePanel(); });
  btn.addEventListener("click", e => { e.stopPropagation(); if (curItem) openPanel(curItem); });

  function openPanel(item) {
    panelItem = item; panelUrl = location.href;
    panel.innerHTML = `
      <div class="dyai-head">
        <span class="dyai-title">AI 怼</span>
        <span class="dyai-tools"><button type="button" class="dyai-gear" title="设置" aria-label="设置">⚙</button><button type="button" class="dyai-x" title="关闭(Esc)" aria-label="关闭">✕</button></span>
      </div>
      <div class="dyai-set">
        <div class="dyai-tip">首次使用:粘贴 API Key(DeepSeek),点保存。昵称可选,填了 AI 才认得出哪句是你说的。</div>
        <input class="dyai-key" type="password" placeholder="API Key(sk-...)" autocomplete="off" spellcheck="false">
        <input class="dyai-me" placeholder="我的抖音昵称(可选,和评论区显示的一致)" autocomplete="off" spellcheck="false">
        <button type="button" class="dyai-go dyai-save">保存并生成</button>
      </div>
      <label class="dyai-in"><i>❯</i><input class="dyai-stance" placeholder="我想表达的意思(可选)" autocomplete="off" spellcheck="false"></label>
      <div class="dyai-ctl">
        <div class="dyai-seg">${STYLES.map((s, i) => `<button type="button" class="dyai-opt" data-v="${s}">${SHORT[i]}</button>`).join("")}</div>
        <button type="button" class="dyai-go dyai-run">生成 ⏎</button>
      </div>
      <div class="dyai-out" aria-live="polite"></div>`;
    panel.style.display = "block"; placePanel();
    panel.querySelector(".dyai-x").onclick = closePanel;
    const out = panel.querySelector(".dyai-out"), go = panel.querySelector(".dyai-run");
    const setBox = panel.querySelector(".dyai-set"), keyIn = panel.querySelector(".dyai-key"), meIn = panel.querySelector(".dyai-me");
    keyIn.value = cfg().apiKey; meIn.value = cfg().me;
    const opts = [...panel.querySelectorAll(".dyai-opt")];
    let style = STYLES.includes(GM_getValue("style", "")) ? GM_getValue("style") : STYLES[0];
    const paint = () => opts.forEach(o => o.classList.toggle("on", o.dataset.v === style));
    opts.forEach(o => o.onclick = () => { style = o.dataset.v; GM_setValue("style", style); paint(); });
    paint();
    panel.querySelector(".dyai-stance").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); run(); } });
    panel.querySelector(".dyai-gear").onclick = () => { setBox.style.display = setBox.style.display === "block" ? "none" : "block"; };
    panel.querySelector(".dyai-save").onclick = () => {
      const k = keyIn.value.trim();
      if (!k) { out.innerHTML = '<div class="dyai-err">Key 不能为空</div>'; return; }
      GM_setValue("apiKey", k); GM_setValue("me", meIn.value.trim());
      setBox.style.display = "none"; run();
    };

    const run = async () => {
      if (!cfg().apiKey) {                       // 第一次用:直接在面板里填 Key
        setBox.style.display = "block"; out.innerHTML = ""; keyIn.focus(); return;
      }
      go.disabled = true; out.innerHTML = '<div class="dyai-msg"><span class="dyai-sp">⠋</span>读取整楼对话…</div>';
      try {
        await expandThread(item);
        const msgs = parseThread(item);
        if (!msgs.length) throw new Error("没读到评论文字(页面结构可能变了)");
        const me = cfg().me, stance = panel.querySelector(".dyai-stance").value.trim();
        const vi = await videoInfo(item);
        const userMsg = [
          "【背景】\n" + [
            vi.author ? `视频作者:${vi.author}` : "",
            vi.desc ? `视频标题/文案(含话题标签):${vi.desc}` : "",
            vi.tags ? `内容分类:${vi.tags}` : "",
            vi.mix ? `所属合集:${vi.mix}` : "",
            vi.date ? `发布时间:${vi.date}` : "",
            vi.summary ? `抖音AI生成的视频内容总结:${vi.summary}` : "",
            vi.chapters ? `视频分章节要点(时间点 标题:内容):\n${vi.chapters}` : "",
            me ? `我的抖音昵称:${me}(下面对话里标【我】的就是我本人)` : "我的昵称没设置,默认要回应的是最后一条发言"
          ].filter(Boolean).join("\n"),
          `【这一楼的对话,按时间顺序】\n${threadText(msgs)}`,
          otherComments(item) ? `【评论区里其他人在聊的(帮你了解视频和大家的关注点)】\n${otherComments(item)}` : "",
          `回怼风格:${style}`,
          stance ? `我想表达的意思:${stance}` : "",
          "请针对这一楼里最新一条不是我发的发言,写 3 条回怼;如果最后一条是我发的,就写我接下来补刀的话。"
        ].filter(Boolean).join("\n\n");
        out.innerHTML = '<div class="dyai-msg"><span class="dyai-sp">⠋</span>生成中…</div>';
        const { topic, replies } = await generate(userMsg);
        out.innerHTML = "";
        if (topic) { const t = document.createElement("div"); t.className = "dyai-topic"; t.textContent = topic; out.appendChild(t); }
        replies.forEach(r => {
          const d = document.createElement("div"); d.className = "dyai-reply"; d.textContent = r;
          d.title = "点击填入回复框并复制";
          d.addEventListener("click", () => { closePanel(); fillAndCopy(item, r); });
          out.appendChild(d);
        });
      } catch (e) {
        out.innerHTML = ""; const d = document.createElement("div"); d.className = "dyai-err";
        d.textContent = String(e.message || e); out.appendChild(d);
      } finally { go.disabled = false; }
    };
    go.onclick = run; run();
  }
})();
