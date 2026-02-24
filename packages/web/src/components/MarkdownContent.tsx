import ReactMarkdown from 'react-markdown';
import { EvidencePopover } from './ui/evidence-popover';

interface MarkdownContentProps {
  content: string;
  className?: string;
  taskId?: string; // Optional taskId to enable evidence popovers
}

export default function MarkdownContent({ content, className = '', taskId }: MarkdownContentProps) {
  // If taskId is provided, we process the content to inject evidence popovers
  const renderers = taskId ? {
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
  } : {};

  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm ${className}`}>
      <ReactMarkdown components={renderers as any}>{content}</ReactMarkdown>
    </div>
  );
}
