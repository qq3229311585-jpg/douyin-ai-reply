(() => {
  const STYLES = ["阴阳怪气", "幽默调侃", "以理服人", "狠但不脏"];
  const TIME_RE = /(刚刚|\d+\s*(分钟|小时|天|周|个月|月|年)前|\d{4}-\d{1,2}-\d{1,2}|昨天|前天)/;
  const ITEM = '[data-e2e="comment-item"]';

  // 取评论正文:innerText 第 1 行昵称,之后到"时间·地点"那行之前都是正文(之后是点赞/回复/楼中楼,忽略)
  function parseComment(item) {
    const lines = item.innerText.split("\n").map(s => s.trim()).filter(Boolean);
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "..." || /^(作者|置顶|作者赞过|作者回复过|热评)$/.test(lines[i])) continue;
      if (TIME_RE.test(lines[i]) && /·|前$/.test(lines[i]) && lines[i].length < 24) break;
      out.push(lines[i]);
    }
    return out.join(" ");
  }

  function videoDesc() {
    const d = document.querySelector('[data-e2e="video-desc"]');
    return d ? d.innerText.replace(/展开$/, "").trim().slice(0, 200) : "";
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "dyai-toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
  }

  // 往 Draft.js 编辑器填文字:先试 paste 事件,没进去再用 execCommand;
  // 抖音的编辑器两种方式在不同时机各有失灵/重复,所以填完要核对,重复了就删掉多的一份。只填不发。
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function insertIntoBox(box, text) {
    const val = () => box.innerText.replace(/\n$/, "");
    box.focus();
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(200);
    if (!val()) { box.focus(); document.execCommand("insertText", false, text); await sleep(200); }
    if (val() === text + text) {           // 被插了两遍:往回删掉一份
      const sel = getSelection();
      for (let i = 0; i < text.length; i++) sel.modify("extend", "backward", "character");
      document.execCommand("delete"); await sleep(150);
    }
    return val() === text;
  }

  async function fillAndCopy(item, text) {
    try { await navigator.clipboard.writeText(text); } catch {}
    try {
      const replyBtn = [...item.querySelectorAll("span,div,button")].find(e => e.children.length === 0 && e.textContent.trim() === "回复");
      replyBtn?.click();
      await sleep(500);
      const box = document.querySelector('.public-DraftEditor-content[contenteditable="true"]');
      if (box && await insertIntoBox(box, text)) {
        toast("已填入回复框(未发送),确认后自己点发送");
        return true;
      }
    } catch {}
    toast("没能自动填入,已复制到剪贴板,点「回复」后粘贴即可");
    return false;
  }

  // ---- 悬浮按钮 + 悬浮面板:全部挂 body,fixed 定位 ----
  const btn = document.createElement("div");
  btn.id = "dyai-btn"; btn.textContent = "AI 怼";
  const panel = document.createElement("div");
  panel.id = "dyai-panel";
  document.body.append(btn, panel);

  let curItem = null;   // 悬停中的评论(只管按钮位置)
  let panelItem = null; // 面板绑定的评论(面板打开期间不随悬停变化)
  let hideTimer = null;

  function placeBtn(item) {
    const r = item.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { btn.style.display = "none"; return; }
    btn.style.display = "block";
    btn.style.top = Math.max(r.top + 4, 4) + "px";
    btn.style.left = Math.max(r.right - btn.offsetWidth - 10, 4) + "px";
  }

  function placePanel() {
    if (!panelItem || !panelItem.isConnected) return closePanel();
    const r = panelItem.getBoundingClientRect();
    const w = 300;
    let left = r.left - w - 8;            // 优先放在评论栏左边(视频区上方)
    if (left < 8) left = Math.min(r.right - w, innerWidth - w - 8);
    let top = Math.min(Math.max(r.top, 8), innerHeight - 160);
    panel.style.left = left + "px"; panel.style.top = top + "px";
  }

  function closePanel() { panel.style.display = "none"; panelItem = null; }

  // 抖音有全局快捷键(空格暂停、F 进主页、方向键切视频),面板里打字不能冒泡出去
  ["keydown", "keyup", "keypress"].forEach(t => panel.addEventListener(t, e => e.stopPropagation()));

  document.addEventListener("mouseover", e => {
    if (e.target === btn || panel.contains(e.target)) { clearTimeout(hideTimer); return; }
    const item = e.target.closest && e.target.closest(ITEM);
    if (item) { clearTimeout(hideTimer); curItem = item; placeBtn(item); }
    else { clearTimeout(hideTimer); hideTimer = setTimeout(() => { btn.style.display = "none"; }, 400); }
  }, true);
  addEventListener("scroll", () => { if (curItem && btn.style.display === "block") placeBtn(curItem); if (panel.style.display === "block") placePanel(); }, true);
  addEventListener("resize", () => { if (panel.style.display === "block") placePanel(); });

  btn.addEventListener("click", e => { e.stopPropagation(); if (curItem) openPanel(curItem); });

  function openPanel(item) {
    panelItem = item;
    panel.innerHTML = `
      <div class="dyai-head"><span>AI 怼 · 不会自动发送</span><span class="dyai-x">✕</span></div>
      <div class="dyai-row">
        <select class="dyai-style">${STYLES.map(s => `<option>${s}</option>`).join("")}</select>
        <input class="dyai-stance" placeholder="我的立场(可选)">
        <button class="dyai-go">生成</button>
      </div>
      <div class="dyai-out"></div>`;
    panel.style.display = "block";
    placePanel();
    panel.querySelector(".dyai-x").onclick = closePanel;
    const out = panel.querySelector(".dyai-out");
    const go = panel.querySelector(".dyai-go");

    const run = () => {
      const text = parseComment(item);
      if (!text) { out.innerHTML = '<div class="dyai-err">没读到评论文字(页面结构可能变了)</div>'; return; }
      go.disabled = true; out.innerHTML = '<div class="dyai-msg">生成中…</div>';
      chrome.runtime.sendMessage({
        type: "generate",
        payload: {
          comment: text, desc: videoDesc(),
          style: panel.querySelector(".dyai-style").value,
          stance: panel.querySelector(".dyai-stance").value.trim(),
          count: 3
        }
      }, res => {
        go.disabled = false; out.innerHTML = "";
        if (!res || !res.ok) {
          const e = document.createElement("div"); e.className = "dyai-err";
          e.textContent = (res && res.error) || chrome.runtime.lastError?.message || "未知错误";
          out.appendChild(e); return;
        }
        res.replies.forEach(r => {
          const d = document.createElement("div"); d.className = "dyai-reply"; d.textContent = r;
          d.title = "点击填入回复框并复制";
          d.addEventListener("click", () => fillAndCopy(item, r));
          out.appendChild(d);
        });
      });
    };
    go.onclick = run;
    run();
  }
})();
