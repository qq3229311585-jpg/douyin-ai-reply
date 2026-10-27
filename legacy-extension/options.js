const D = { apiKey: "", model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com" };
const ids = Object.keys(D);
chrome.storage.sync.get(D).then(c => ids.forEach(k => document.getElementById(k).value = c[k]));
document.getElementById("save").onclick = async () => {
  const v = {}; ids.forEach(k => v[k] = document.getElementById(k).value.trim());
  try {
    const origin = new URL(v.baseUrl).origin + "/*";
    await chrome.permissions.request({ origins: [origin] }); // 换了接口地址时需要授权访问
  } catch {}
  await chrome.storage.sync.set(v);
  document.getElementById("ok").textContent = "已保存";
};
