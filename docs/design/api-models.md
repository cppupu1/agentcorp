# 模型管理 API

对应实现：`packages/server/src/routes/models.ts` + `packages/web/src/pages/models/`

## API 端点

### GET /api/models

获取模型列表。

响应：
```json
{
  "data": [
    {
      "id": "a1b2c3d4e5f6",
      "name": "GPT-4o",
      "baseUrl": "https://api.openai.com/v1",
      "modelId": "gpt-4o",
      "notes": "",
      "status": "available",
      "createdAt": "2026-02-16T12:00:00Z",
      "updatedAt": "2026-02-16T12:00:00Z"
    }
  ]
}
```

注意：列表接口不返回 `apiKey`。

### GET /api/models/:id

获取单个模型详情。

响应同上（单个对象），同样不返回 `apiKey`。

### POST /api/models

创建模型。

请求：
```json
{
  "name": "GPT-4o",
  "baseUrl": "https://api.openai.com/v1",
  "modelId": "gpt-4o",
  "apiKey": "sk-xxx",
  "notes": "主力模型"
}
```

响应：创建后的完整模型对象（不含 apiKey）。

```json
{
  "data": {
    "id": "a1b2c3d4e5f6",
    "name": "GPT-4o",
    "baseUrl": "https://api.openai.com/v1",
    "modelId": "gpt-4o",
    "notes": "主力模型",
    "status": "untested",
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

校验规则：
- `name`：必填，1-100 字符
- `baseUrl`：必填，合法 URL
- `modelId`：必填，1-200 字符
- `apiKey`：必填
- 校验失败返回 `VALIDATION_ERROR`（见全局 API 规范）

### PUT /api/models/:id

更新模型。

请求：同 POST，所有字段可选。`apiKey` 为空字符串时不更新。

响应：更新后的完整模型对象。模型不存在时返回 `NOT_FOUND`。

### DELETE /api/models/:id

删除模型。

前置检查：如果有员工引用该模型，返回 `CONFLICT` 错误（含引用的员工列表）。

模型不存在时返回 `NOT_FOUND`。

### POST /api/models/:id/test

测试模型连通性。

实现逻辑：
1. 从数据库读取模型配置（含解密后的 apiKey）
2. 使用 AI SDK 发送一个简单请求：
   ```typescript
   import { generateText } from 'ai';
   import { createOpenAI } from '@ai-sdk/openai';

   const provider = createOpenAI({ apiKey, baseURL });
   const { text } = await generateText({
     model: provider(modelId),
     prompt: 'Hi',
     maxTokens: 10,
   });
   ```
3. 成功则更新 status 为 `available`，失败则更新为 `unavailable`

响应（不使用 `data` 包装，因为 test 端点返回的是操作结果而非资源对象。无论成功失败均返回 HTTP 200，通过 `success` 字段区分）：
```json
{
  "success": true,
  "status": "available",
  "message": "连接成功，模型响应正常"
}
```

或：
```json
{
  "success": false,
  "status": "unavailable",
  "message": "连接失败：401 Unauthorized"
}
```

注意：test 端点会同步更新数据库中模型的 `status` 字段。调用方可通过 GET /api/models/:id 验证状态已持久化。

## 前端页面

### 模型列表页 `/models`

- 表格展示：名称、模型标识、Base URL、状态、操作
- 状态用颜色标签区分：untested(灰)、available(绿)、unavailable(红)
- 操作：编辑、测试、删除
- 右上角"添加模型"按钮

### 模型表单（Dialog）

- 添加/编辑共用同一个 Dialog 组件
- 字段：名称、Base URL、模型标识、API Key（密码输入框）、备注
- 编辑时 API Key 显示为占位符，留空表示不修改
