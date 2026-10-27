# 抖音评论 AI 怼

油猴(Tampermonkey)脚本。在抖音网页版评论区悬停某条评论,右上角出现「AI 怼」。点开后读完整楼对话和视频信息,生成 3 条回怼,点选一条即填入回复框(只填不发,发不发由你决定)。

## 安装

1. Chrome 装 [Tampermonkey](https://www.tampermonkey.net/)
2. 新建脚本,把 `douyin-ai-reply.user.js` 的内容整段粘进去保存
3. 打开 douyin.com,悬停任意评论,点「AI 怼」,第一次会在面板里让你填 API Key(以及可选的自己的抖音昵称)

Key 只存在本机油猴里,不在代码里。默认接 DeepSeek(`https://api.deepseek.com`,模型 `deepseek-chat`),地址含 `anthropic.com` 时自动按 Claude 的格式调用,也可以通过油猴菜单改模型和接口地址。

## 它读了什么

- 这一楼的全部发言(自动点开所有「展开 N 条回复」),并按你填的昵称标出哪句是你说的、哪句是视频作者说的
- 视频文案、话题标签、作者,以及抖音页面自己用的同源详情接口里的 AI 内容总结、分章节要点、分类、合集
- 评论区里其他几条评论,用来判断大家在聊什么

AI 看不到视频画面和声音,只能看到以上文字信息。详情接口是抖音页面内部接口,不是官方公开接口,同一个视频只在点「生成」时请求一次并缓存。

## 界面

当前默认界面是「现代 TUI」风格(近黑底、单一蓝色强调、等宽字体)。

`ui-options/` 里是其他备选界面的可交互预览页,浏览器直接打开就能看(点「生成」会重放加载和出结果的过程):

| 文件 | 内容 |
| --- | --- |
| `01-terminal-newspaper-hardware.html` | 终端 / 报纸 / 硬件各三版(现在用的是第一个 T1) |
| `02-eight-wild-styles.html` | 8 种差异很大的方向:终端、杂志社论、新野兽派、液态玻璃、街机格斗、硬件、经典 Mac、纯排版 |
| `03-neutral-abc.html` | 三版中性灰:shadcn 风、Radix 灰阶、偏终端暖灰 |
| `opus-red-design/` | 最早的红色版本(已弃用) |

想换界面:脚本里的样式是 `st.textContent` 里那一大块 CSS,加上 `openPanel` 里的 HTML 模板,两处替换即可,功能代码不用动。预览页里的备选版本还没有移植进脚本。

## 目录

- `douyin-ai-reply.user.js`:脚本本体
- `ui-options/`:备选界面预览
- `legacy-extension/`:最早的 Chrome 扩展版本,已不再维护
