import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/i18n';
import { RotateCcw, Pause, Download, Info } from 'lucide-react';

export interface SlashCommand {
  id: string;
  icon: React.ReactNode;
  description: string;
}

const COMMANDS: SlashCommand[] = [
  { id: 'retry', icon: <RotateCcw className="h-3.5 w-3.5" />, description: 'slashCmd.retryDesc' },
  { id: 'pause', icon: <Pause className="h-3.5 w-3.5" />, description: 'slashCmd.pauseDesc' },
  { id: 'export', icon: <Download className="h-3.5 w-3.5" />, description: 'slashCmd.exportDesc' },
  { id: 'status', icon: <Info className="h-3.5 w-3.5" />, description: 'slashCmd.statusDesc' },
];

interface SlashCommandMenuProps {
  input: string;
  onSelect: (commandId: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function SlashCommandMenu({ input, onSelect, anchorRef }: SlashCommandMenuProps) {
  const { t } = useI18n();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Only show when input starts with "/" and nothing else before it
  const slashMatch = input.match(/^\/(\w*)$/);
  const query = slashMatch ? slashMatch[1].toLowerCase() : null;

  const filtered = query !== null
    ? COMMANDS.filter(c => c.id.startsWith(query))
    : [];

  // Reset selection when filtered list changes
  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      onSelect(filtered[selectedIndex].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onSelect('');
    }
  }, [filtered, selectedIndex, onSelect]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const el = anchorRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [anchorRef, handleKeyDown]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border/40 rounded-lg shadow-[var(--shadow-md)] overflow-hidden z-10"
    >
      <div className="py-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
              i === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'
            }`}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => onSelect(cmd.id)}
          >
            <span className="text-muted-foreground">{cmd.icon}</span>
            <span className="font-medium">/{cmd.id}</span>
            <span className="text-xs text-muted-foreground">{t(cmd.description)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
