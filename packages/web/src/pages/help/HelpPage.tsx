export default function HelpPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h2 className="text-2xl font-semibold">使用帮助</h2>
      <p className="text-muted-foreground">
        AgentCorp 是一个多智能体团队管理平台，让你可以组建 AI 员工团队来协作完成各种任务。以下是快速上手指南。
      </p>

      <Section icon="🧠" title="1. 配置模型" id="models">
        <p>进入「模型」页面，添加你的 LLM 模型（如 GLM-4、Qwen 等）。</p>
        <ul>
          <li>填写模型名称、API 地址、模型 ID 和 API Key</li>
          <li>点击「测试连接」确认模型可用</li>
        </ul>
      </Section>

      <Section icon="🔧" title="2. 添加工具" id="tools">
        <p>进入「工具」页面，为员工配备能力扩展工具。</p>
        <ul>
          <li><b>Stdio 工具</b> — 本地 npm 包，如文件系统、计算器</li>
          <li><b>SSE 工具</b> — 远程 MCP 服务，如网络搜索、网页抓取</li>
          <li>添加后点击闪电图标测试工具是否可用</li>
        </ul>
      </Section>

      <Section icon="👤" title="3. 创建员工" id="employees">
        <p>进入「员工」页面，创建具有不同角色的 AI 员工。</p>
        <ul>
          <li>为每个员工选择模型、编写系统提示词来定义角色</li>
          <li>分配工具让员工具备搜索、读取文件等能力</li>
          <li>点击员工卡片上的对话图标可直接与员工聊天</li>
        </ul>
      </Section>

      <Section icon="👥" title="4. 组建团队" id="teams">
        <p>进入「团队」页面，将多个员工组成协作团队。</p>
        <ul>
          <li>指定一名项目经理（PM）负责任务拆解和分配</li>
          <li>添加成员员工，PM 会根据各自专长分配子任务</li>
          <li>选择协作模式：顺序执行或并行执行</li>
        </ul>
      </Section>

      <Section icon="📋" title="5. 发布任务" id="tasks">
        <p>进入「任务」页面，向团队下发工作任务。</p>
        <ul>
          <li>选择目标团队，描述任务需求</li>
          <li>选择模式：「建议」模式需人工确认，「自动」模式全自动执行</li>
          <li>任务详情页可实时查看执行进度、与团队对话</li>
        </ul>
      </Section>

      <Section icon="⏰" title="6. 触发器（可选）" id="triggers">
        <p>设置定时任务或 Webhook 触发器，让团队自动响应事件。</p>
      </Section>

      <Section icon="📚" title="7. 知识库（可选）" id="knowledge">
        <p>创建知识库并添加文档，员工执行任务时可检索相关知识。</p>
      </Section>

      <Section icon="📜" title="8. 策略（可选）" id="policies">
        <p>定义安全和行为策略，约束员工的输出内容和行为边界。</p>
      </Section>

      <Section icon="🚨" title="紧急停止" id="emergency">
        <p>
          侧边栏顶部的红色「紧急停止」按钮可立即冻结系统，暂停所有正在执行的任务并禁止创建新任务。
          冻结后按钮变为绿色「解除冻结」，点击即可恢复。
        </p>
      </Section>

      <div className="border rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
        <b>推荐流程：</b>配置模型 → 添加工具 → 创建员工 → 组建团队 → 发布任务
      </div>
    </div>
  );
}

function Section({ icon, title, id, children }: {
  icon: string; title: string; id: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-2">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <span>{icon}</span>{title}
      </h3>
      <div className="text-sm text-muted-foreground space-y-2 pl-7 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}
