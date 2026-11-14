# 豆包 TTS 中转

这个 Worker 只负责把网页的 TTS 请求转发到豆包，豆包 API Key 放在 Worker Secret 里。

部署时设置三个变量：

- `DOUBAO_API_KEY`，豆包 API Key，使用 `wrangler secret put DOUBAO_API_KEY`
- `DOUBAO_RESOURCE_ID`，当前默认资源为 `volc.seedtts.default`。如果接口返回资源未授权，再以控制台“API 接入”页面显示的资源 ID 为准。
- `ALLOWED_ORIGIN`，默认 `https://heruih.github.io`。Worker 另外允许 `Origin: null` 和 `sitecase://...`，用于 Sitecase 打开的本地 HTML。

部署命令示例：

```powershell
npx wrangler deploy relay/doubao-tts-worker.js --name english-notes-tts
npx wrangler secret put DOUBAO_API_KEY --name english-notes-tts
```

部署后把 Worker 地址填入网页设置中的“服务端中转地址”，例如 `https://english-notes-tts.<你的账号>.workers.dev`。网页请求体沿用豆包 V3 的 `req_params` 格式，响应原样返回，便于保留接口错误信息。
