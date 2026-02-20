# 团队管理 API

对应实现：`packages/server/src/routes/teams.ts` + `packages/web/src/pages/teams/`

## API 端点

### GET /api/teams

获取团队列表。

响应：
```json
{
  "data": [
    {
      "id": "team001",
      "name": "数据分析团队",
      "description": "专注于数据采集、分析和可视化",
      "scenario": "数据分析",
      "pmEmployee": {
        "id": "emp001",
        "name": "数据分析经理",
        "avatar": "👨‍💼"
      },
      "collaborationMode": "free",
      "memberCount": 4,
      "toolCount": 5,
      "taskCount": 12,
      "createdAt": "2026-02-16T12:00:00Z",
      "updatedAt": "2026-02-16T12:00:00Z"
    }
  ]
}
```

### GET /api/teams/:id

获取团队详情，包含完整成员列表和工具授权列表。

响应：
```json
{
  "data": {
    "id": "team001",
    "name": "数据分析团队",
    "description": "专注于数据采集、分析和可视化",
    "scenario": "数据分析",
    "pmEmployee": {
      "id": "emp001",
      "name": "数据分析经理",
      "avatar": "👨‍💼"
    },
    "collaborationMode": "free",
    "members": [
      {
        "id": "emp002",
        "name": "数据采集员",
        "avatar": "🔍",
        "role": "member",
        "tags": ["采集", "GPT-4o"]
      },
      {
        "id": "emp003",
        "name": "质量观察者",
        "avatar": "👁️",
        "role": "observer",
        "tags": ["观察者"]
      }
    ],
    "tools": [
      { "id": "t1", "name": "网页搜索" },
      { "id": "t2", "name": "Python执行" }
    ],
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

### POST /api/teams

创建团队。

请求：
```json
{
  "name": "数据分析团队",
  "description": "专注于数据采集、分析和可视化",
  "scenario": "数据分析",
  "pmEmployeeId": "emp001",
  "collaborationMode": "free",
  "members": [
    { "employeeId": "emp002", "role": "member" },
    { "employeeId": "emp003", "role": "observer" }
  ],
  "toolIds": ["t1", "t2"]
}
```

校验规则：
- `name`：必填，1-100 字符
- `pmEmployeeId`：必填，必须引用已存在的员工，否则返回 `NOT_FOUND`
- `collaborationMode`：必须为 `free`/`pipeline`/`debate`/`vote`/`master_slave` 之一
- `members[].employeeId`：必须引用已存在的员工
- `toolIds`：每个 ID 必须引用已存在的工具
- PM 不需要重复出现在 members 中（自动包含）
- 校验失败返回 `VALIDATION_ERROR`，引用不存在返回 `NOT_FOUND`

响应：创建后的完整团队对象（同 GET /api/teams/:id 格式）。

```json
{
  "data": {
    "id": "team001",
    "name": "数据分析团队",
    "description": "专注于数据采集、分析和可视化",
    "scenario": "数据分析",
    "pmEmployee": {
      "id": "emp001",
      "name": "数据分析经理",
      "avatar": "👨‍💼"
    },
    "collaborationMode": "free",
    "members": [
      { "id": "emp002", "name": "数据采集员", "avatar": "🔍", "role": "member", "tags": ["采集", "GPT-4o"] },
      { "id": "emp003", "name": "质量观察者", "avatar": "👁️", "role": "observer", "tags": ["观察者"] }
    ],
    "tools": [
      { "id": "t1", "name": "网页搜索" },
      { "id": "t2", "name": "Python执行" }
    ],
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

### PUT /api/teams/:id

更新团队。所有字段可选。`members` 和 `toolIds` 传入时整体替换。

响应：更新后的完整团队对象。团队不存在时返回 `NOT_FOUND`。

### DELETE /api/teams/:id

删除团队。

前置检查：如果有进行中的任务（status 不是 completed/failed），返回 `CONFLICT` 错误（含进行中的任务列表）。

团队不存在时返回 `NOT_FOUND`。

### POST /api/teams/:id/copy

复制团队。名称追加"(副本)"，复制成员和工具授权配置。

## 前端页面

### 团队列表页 `/teams`

- 卡片式展示
- 卡片信息：名称、描述、PM 头像+名称、成员数、协作模式、历史任务数
- 搜索框
- 操作：编辑、复制、删除、查看历史任务
- 右上角"创建团队"按钮

### 团队表单页 `/teams/new` 和 `/teams/:id/edit`

- 独立页面
- 分区：
  1. 基本信息：名称、描述、适用场景
  2. PM 指定：从员工列表中选择一名作为 PM（下拉搜索）
  3. 成员管理：从员工列表中添加成员，可设置角色（member/observer）
     - 已选成员列表，可移除
     - 添加成员按钮 → 弹出员工选择 Dialog（支持搜索和标签筛选）
  4. 工具授权：从工具列表中选择团队可用工具
     - 按分组展示，支持全选/取消
  5. 协作模式：单选（MVP 阶段只实现 free 模式，其他模式灰显标注"即将推出"）
