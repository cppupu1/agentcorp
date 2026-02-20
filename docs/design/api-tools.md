# 工具管理 API

对应实现：`packages/server/src/routes/tools.ts` + `packages/web/src/pages/tools/`

## API 端点

### GET /api/tools

获取工具列表。

查询参数：
- `group`（可选）：按分组筛选

响应：
```json
{
  "data": [
    {
      "id": "x1y2z3",
      "name": "文件系统",
      "description": "读写本地文件系统",
      "command": "@modelcontextprotocol/server-filesystem",
      "args": ["/tmp/workspace"],
      "groupName": "文件操作",
      "status": "available",
      "createdAt": "2026-02-16T12:00:00Z",
      "updatedAt": "2026-02-16T12:00:00Z"
    }
  ]
}
```

注意：列表接口不返回 `envVars`。

### GET /api/tools/:id

获取单个工具详情。不返回 `envVars` 的值（只返回 key 列表）。

### POST /api/tools

创建工具。

请求：
```json
{
  "name": "文件系统",
  "description": "读写本地文件系统，支持创建、读取、更新、删除文件和目录",
  "command": "@modelcontextprotocol/server-filesystem",
  "args": ["/tmp/workspace"],
  "envVars": { "SOME_KEY": "value" },
  "groupName": "文件操作"
}
```

响应：创建后的完整工具对象（不含 envVars 值）。

```json
{
  "data": {
    "id": "x1y2z3",
    "name": "文件系统",
    "description": "读写本地文件系统，支持创建、读取、更新、删除文件和目录",
    "command": "@modelcontextprotocol/server-filesystem",
    "args": ["/tmp/workspace"],
    "groupName": "文件操作",
    "status": "untested",
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

校验规则：
- `name`：必填，1-100 字符
- `description`：必填，1-5000 字符
- `command`：必填
- 校验失败返回 `VALIDATION_ERROR`

### PUT /api/tools/:id

更新工具。所有字段可选。`envVars` 中值为空字符串的 key 不更新。

响应：更新后的完整工具对象。工具不存在时返回 `NOT_FOUND`。

### DELETE /api/tools/:id

删除工具。

前置检查：如果有员工或团队引用该工具，返回 `CONFLICT` 错误（含引用方列表）。

工具不存在时返回 `NOT_FOUND`。

### POST /api/tools/:id/test

测试工具可用性。

实现逻辑：
1. 从数据库读取工具配置
2. 使用 MCP SDK 启动工具进程：
   ```typescript
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

   const transport = new StdioClientTransport({
     command: 'npx',
     args: ['-y', tool.command, ...tool.args],
     env: { ...process.env, ...decryptedEnvVars },
   });

   const client = new Client({ name: 'agentcorp-test', version: '1.0.0' });
   await client.connect(transport);

   // 获取工具列表验证连通性
   const { tools } = await client.listTools();

   await client.close();
   ```
3. 成功获取到工具列表则更新 status 为 `available`
4. 超时（30s）或异常则更新为 `unavailable`

响应（不使用 `data` 包装，因为 test 端点返回的是操作结果而非资源对象。无论成功失败均返回 HTTP 200，通过 `success` 字段区分）：
```json
{
  "success": true,
  "status": "available",
  "tools": [
    { "name": "read_file", "description": "Read file contents" },
    { "name": "write_file", "description": "Write content to file" }
  ],
  "message": "工具启动成功，发现 2 个可用工具"
}
```

注意：test 端点会同步更新数据库中工具的 `status` 字段。调用方可通过 GET /api/tools/:id 验证状态已持久化。

### GET /api/tools/groups

获取所有工具分组列表（去重）。

响应：
```json
{
  "data": ["文件操作", "数据获取", "通信"]
}
```

## 前端页面

### 工具列表页 `/tools`

- 按分组折叠展示，每组显示工具卡片
- 卡片信息：名称、描述、启动命令、状态
- 操作：编辑、测试、删除
- 支持搜索（按名称/描述）
- 右上角"添加工具"按钮

### 工具表单（Dialog）

- 字段：名称、描述（textarea）、启动命令、启动参数（可动态增减）、环境变量（key-value 可动态增减）、分组（下拉+自定义输入）
- 描述字段提示：此描述会被 LLM 读取，请清晰描述工具能力
