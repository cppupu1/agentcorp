# 数据库 Schema 设计

对应实现：`packages/db`

## 概述

使用 SQLite (better-sqlite3) + Drizzle ORM。所有表使用 TEXT 类型的随机 ID 作为主键，JSON 字段用 TEXT 存储。时间字段统一使用 ISO 8601 格式字符串。

## 表结构

### models（模型）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| name | TEXT NOT NULL | 显示名称（如"GPT-4o"） |
| base_url | TEXT NOT NULL | API 端点地址 |
| model_id | TEXT NOT NULL | 模型标识（调用时的 model 参数） |
| api_key | TEXT NOT NULL | API Key（加密存储） |
| notes | TEXT | 备注 |
| status | TEXT | `untested` / `available` / `unavailable` |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### tools（工具）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| name | TEXT NOT NULL | 工具名称 |
| description | TEXT NOT NULL | 工具描述（LLM 可读） |
| command | TEXT NOT NULL | npx 启动命令 |
| args | TEXT (JSON) | 启动参数数组 |
| env_vars | TEXT (JSON) | 环境变量（加密存储） |
| group_name | TEXT | 所属分组 |
| status | TEXT | `untested` / `available` / `unavailable` |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### employees（员工）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| name | TEXT NOT NULL | 员工名称 |
| avatar | TEXT | 头像（emoji 或 URL） |
| description | TEXT | 简介 |
| model_id | TEXT FK → models.id | 关联模型 |
| system_prompt | TEXT NOT NULL | 系统提示词 |
| tags | TEXT (JSON) | 标签数组 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### employee_tools（员工-工具关联）

| 字段 | 类型 | 说明 |
|------|------|------|
| employee_id | TEXT FK → employees.id | 员工 ID |
| tool_id | TEXT FK → tools.id | 工具 ID |

复合主键：(employee_id, tool_id)，级联删除。

### teams（团队）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| name | TEXT NOT NULL | 团队名称 |
| description | TEXT | 团队描述 |
| scenario | TEXT | 适用场景 |
| pm_employee_id | TEXT FK → employees.id | PM 员工 |
| collaboration_mode | TEXT | `free` / `pipeline` / `debate` / `vote` / `master_slave` |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### team_members（团队成员）

| 字段 | 类型 | 说明 |
|------|------|------|
| team_id | TEXT FK → teams.id | 团队 ID |
| employee_id | TEXT FK → employees.id | 员工 ID |
| role | TEXT | `member` / `observer` |

复合主键：(team_id, employee_id)，级联删除。

### team_tools（团队工具授权）

| 字段 | 类型 | 说明 |
|------|------|------|
| team_id | TEXT FK → teams.id | 团队 ID |
| tool_id | TEXT FK → tools.id | 工具 ID |

复合主键：(team_id, tool_id)，级联删除。

### tasks（任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| team_id | TEXT FK → teams.id | 所属团队 |
| title | TEXT | 任务标题 |
| description | TEXT | 用户原始描述 |
| status | TEXT | 状态机（见下文） |
| mode | TEXT | `suggest` / `auto` |
| brief | TEXT (JSON) | 任务书 |
| team_config | TEXT (JSON) | 本次任务的团队配置快照 |
| plan | TEXT (JSON) | 执行计划 |
| result | TEXT (JSON) | 最终交付物 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### task_messages（任务消息）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| task_id | TEXT FK → tasks.id | 所属任务 |
| role | TEXT NOT NULL | `user` / `assistant` / `system` |
| sender_id | TEXT | 发送者 employee_id（空=用户/系统） |
| content | TEXT NOT NULL | 消息内容 |
| message_type | TEXT | `chat` / `brief` / `plan` / `approval` / `result` |
| metadata | TEXT (JSON) | 附加元数据 |
| created_at | TEXT | 创建时间 |

索引：`idx_task_messages_task_id` ON task_messages(task_id)

### subtasks（子任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| task_id | TEXT FK → tasks.id | 所属任务 |
| title | TEXT NOT NULL | 子任务标题 |
| description | TEXT | 子任务描述 |
| assignee_id | TEXT FK → employees.id | 负责员工 |
| status | TEXT | `pending` / `running` / `completed` / `failed` |
| depends_on | TEXT (JSON) | 依赖的子任务 ID 列表 |
| input | TEXT (JSON) | 输入数据 |
| output | TEXT (JSON) | 输出数据 |
| sort_order | INTEGER | 排序序号 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

索引：`idx_subtasks_task_id` ON subtasks(task_id)

### employee_chat_messages（员工测试对话）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 随机 ID |
| employee_id | TEXT FK → employees.id | 员工 ID |
| session_id | TEXT NOT NULL | 会话 ID |
| role | TEXT NOT NULL | `user` / `assistant` |
| content | TEXT NOT NULL | 消息内容 |
| tool_calls | TEXT (JSON) | 工具调用记录 |
| created_at | TEXT | 创建时间 |

索引：`idx_employee_chat_session` ON employee_chat_messages(employee_id, session_id)

## 任务状态机

```
draft → aligning → brief_review → team_review → plan_review → executing → completed
            ↑          |               ↑            |                        ↓
            └──────────┘(拒绝)         └────────────┘(拒绝)                failed
                                  (拒绝 plan → team_review)
```

正向流转：draft → aligning → brief_review → team_review → plan_review → executing → completed/failed

回退路径（审批拒绝时）：
- brief_review → aligning（拒绝任务书）
- team_review → brief_review（拒绝团队配置）
- plan_review → team_review（拒绝执行计划）

| 状态 | 说明 | 进入条件 |
|------|------|----------|
| draft | 草稿 | 用户创建任务 |
| aligning | 需求对齐中 | 用户开始与 PM 对话 |
| brief_review | 任务书待审批 | PM 生成任务书 |
| team_review | 团队配置待确认 | 用户批准任务书 |
| plan_review | 执行计划待审批 | PM 生成执行计划 |
| executing | 执行中 | 用户批准执行计划 |
| completed | 已完成 | 所有子任务完成 |
| failed | 失败 | 执行异常且无法恢复 |

## API Key 加密

使用 Node.js 内置 `crypto` 模块，AES-256-GCM 对称加密：

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes hex

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(data: string): string {
  const [ivHex, tagHex, encryptedHex] = data.split(':');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}
```

环境变量 `ENCRYPTION_KEY` 在首次启动时自动生成并写入 `.env` 文件。
