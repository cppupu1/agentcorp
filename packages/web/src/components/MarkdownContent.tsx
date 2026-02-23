import ReactMarkdown from 'react-markdown';

export default function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
