# 豆包 TTS 中转

这个 Worker 只负责把网页的 TTS 请求转发到豆包，豆包 API Key 放在 Worker Secret 里。

部署时设置三个变量：

- `DOUBAO_API_KEY`，豆包 API Key，使用 `wrangler secret put DOUBAO_API_KEY`
- `DOUBAO_RESOURCE_ID`，默认 `seed-tts-2.0`
- `ALLOWED_ORIGIN`，默认 `https://heruih.github.io`

部署命令示例：

```powershell
npx wrangler deploy relay/doubao-tts-worker.js --name english-notes-tts
npx wrangler secret put DOUBAO_API_KEY --name english-notes-tts
```

部署后把 Worker 地址填入网页设置中的“服务端中转地址”，例如 `https://english-notes-tts.<你的账号>.workers.dev`。网页请求体沿用豆包 V3 的 `req_params` 格式，响应原样返回，便于保留接口错误信息。
