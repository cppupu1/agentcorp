import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EvidencePopover } from './ui/evidence-popover';
import { Copy, Check, Download } from 'lucide-react';
import { useI18n } from '@/i18n';

interface MarkdownContentProps {
  content: string;
  className?: string;
  taskId?: string; // Optional taskId to enable evidence popovers
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const lang = className?.replace('language-', '') || '';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const handleDownload = useCallback(() => {
    const ext: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', java: 'java', json: 'json', html: 'html', css: 'css', sql: 'sql', bash: 'sh', shell: 'sh', yaml: 'yml', xml: 'xml', go: 'go', rust: 'rs' };
    const filename = `code.${ext[lang] || lang || 'txt'}`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, lang]);

  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleCopy} className="p-1.5 rounded-lg bg-background/80 border border-border/40 text-muted-foreground hover:text-foreground transition-colors" title={t('markdown.copy')}>
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button onClick={handleDownload} className="p-1.5 rounded-lg bg-background/80 border border-border/40 text-muted-foreground hover:text-foreground transition-colors" title={t('markdown.download')}>
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {lang && <span className="absolute left-3 top-2 text-[10px] text-muted-foreground/60 select-none">{lang}</span>}
      <pre><code className={className}>{children}</code></pre>
    </div>
  );
}

export default function MarkdownContent({ content, className = '', taskId }: MarkdownContentProps) {
  // Code block renderer with copy/download buttons
  const codeRenderer = {
    code: ({ className: cn, children, ...props }: any) => {
      const isBlock = /language-/.test(cn || '') || (typeof children === 'string' && children.includes('\n'));
      if (!isBlock) return <code className={cn} {...props}>{children}</code>;
      return <CodeBlock className={cn}>{children}</CodeBlock>;
    },
  };

  // If taskId is provided, we process the content to inject evidence popovers
  const renderers = taskId ? {
    ...codeRenderer,
    a: ({ node, href, children, ...props }: any) => {
      // Look for custom evidence links like [1](#evidence:evidence_id) or just parse standard text links
      if (href?.startsWith('#evidence:')) {
        const evidenceId = href.replace('#evidence:', '');
        return (
          <EvidencePopover taskId={taskId} evidenceId={evidenceId}>
            {children}
          </EvidencePopover>
        );
      }
      return <a href={href} {...props} className="text-primary hover:underline">{children}</a>;
    },
    text: ({ node, children }: any) => {
      if (typeof children !== 'string') return children;
      
      // Regex to find citation patterns like [1] or [evidence-id]
      const citationRegex = /\[([a-zA-Z0-9_-]+)\]/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = citationRegex.exec(children)) !== null) {
        if (match.index > lastIndex) {
          parts.push(children.substring(lastIndex, match.index));
        }
        
        const citationId = match[1];
        // Only treat it as an evidence citation if it looks like an ID or a number
        if (citationId.length > 0) {
           parts.push(
             <EvidencePopover key={match.index} taskId={taskId} evidenceId={citationId}>
               [{citationId}]
             </EvidencePopover>
           );
        } else {
           parts.push(match[0]);
        }
        
        lastIndex = citationRegex.lastIndex;
      }

      if (lastIndex < children.length) {
        parts.push(children.substring(lastIndex));
      }

      return parts.length > 1 ? <>{parts}</> : children;
    }
  } : codeRenderer;

  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers as any}>{content}</ReactMarkdown>
    </div>
  );
}
