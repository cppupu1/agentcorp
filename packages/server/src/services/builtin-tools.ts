import { db, tools, generateId, now } from '@agentcorp/db';
import { eq } from 'drizzle-orm';

const BUILTIN_GROUP = '预置工具';

interface BuiltinTool {
  name: string;
  description: string;
  transportType: 'stdio' | 'sse';
  command: string;
  args?: string[];
  envVars?: Record<string, string>;
  accessLevel: string;
  enabled?: boolean;
}

const builtinTools: BuiltinTool[] = [
  {
    name: '搏查搜索',
    description: '搏查 AI 搜索引擎，支持网页搜索和 AI 结构化搜索（天气、百科、医疗等垂直领域）。需要 API Key（https://open.bochaai.com）。',
    transportType: 'sse',
    command: 'https://mcp.bochaai.com/sse',
    envVars: { Authorization: '' },
    accessLevel: 'read',
    enabled: false,
  },
  {
    name: 'Web Fetch',
    description: '抓取网页内容并转换为 Markdown，让 AI 能够阅读和处理网页信息。支持自定义 User-Agent 和代理设置。',
    transportType: 'stdio',
    command: 'mcp-server-fetch-typescript',
    accessLevel: 'read',
  },
  {
    name: 'Brave Search',
    description: 'Brave 搜索引擎集成，支持网页搜索、图片搜索、视频搜索和 AI 摘要。需要 Brave Search API Key（https://brave.com/search/api/）。',
    transportType: 'stdio',
    command: '@brave/brave-search-mcp-server',
    envVars: { BRAVE_API_KEY: '' },
    accessLevel: 'read',
    enabled: false,
  },
  {
    name: 'GitHub',
    description: 'GitHub API 集成，支持仓库管理、Issue、Pull Request、代码搜索等操作。需要 GitHub Personal Access Token。',
    transportType: 'stdio',
    command: '@modelcontextprotocol/server-github',
    envVars: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    accessLevel: 'write',
    enabled: false,
  },
  {
    name: 'Filesystem',
    description: '本地文件系统访问，支持读写文件、目录浏览、文件搜索等操作。需要在参数中指定允许访问的目录路径。',
    transportType: 'stdio',
    command: '@modelcontextprotocol/server-filesystem',
    args: ['/tmp'],
    accessLevel: 'write',
  },
  {
    name: 'Memory',
    description: '基于知识图谱的持久化记忆工具，AI 员工可以跨任务记住关键信息（实体、关系、观察），适合需要长期记忆的场景。',
    transportType: 'stdio',
    command: '@modelcontextprotocol/server-memory',
    accessLevel: 'write',
  },
  {
    name: 'Puppeteer',
    description: '浏览器自动化工具，支持网页截图、页面操作、表单填写、JavaScript 执行等。需要服务器环境安装 Chrome/Chromium。',
    transportType: 'stdio',
    command: '@modelcontextprotocol/server-puppeteer',
    accessLevel: 'write',
  },
  {
    name: 'Yahoo Finance',
    description: '全球股票市场数据工具，支持实时报价、历史行情、公司财报、基本面分析和财经新闻。覆盖美股、港股等全球主要市场，无需 API Key。',
    transportType: 'stdio',
    command: 'yfinance-mcp',
    accessLevel: 'read',
  },
  {
    name: 'Tushare Pro 金融数据',
    description: '中国 A 股金融数据工具，支持日线/周线行情、股票基本信息、K线图等查询。基于 Tushare Pro，需要 Token（https://tushare.pro）。需要 Python + uv 环境。',
    transportType: 'stdio',
    command: 'uvx',
    args: ['tushare-mcp', '--token', ''],
    accessLevel: 'read',
    enabled: false,
  },
];

export async function seedBuiltinTools() {
  const existing = await db.select({ name: tools.name })
    .from(tools)
    .where(eq(tools.groupName, BUILTIN_GROUP));

  const existingNames = new Set(existing.map(e => e.name));
  const newTools = builtinTools.filter(t => !existingNames.has(t.name));

  if (newTools.length === 0) return;

  const timestamp = now();

  db.transaction((tx) => {
    for (const tool of newTools) {
      tx.insert(tools).values({
        id: generateId(),
        name: tool.name,
        description: tool.description,
        transportType: tool.transportType,
        command: tool.command,
        args: tool.args ? JSON.stringify(tool.args) : null,
        envVars: tool.envVars ? JSON.stringify(tool.envVars) : null,
        groupName: BUILTIN_GROUP,
        accessLevel: tool.accessLevel,
        enabled: tool.enabled === false ? 0 : 1,
        status: 'untested',
        createdAt: timestamp,
        updatedAt: timestamp,
      }).run();
    }
  });

  console.log(`Seeded ${newTools.length} new built-in tools`);
}
