import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ChatDrawerState {
  open: boolean;
  taskId: string | null;
  taskTitle: string | null;
  openChat: (taskId: string, taskTitle?: string) => void;
  closeChat: () => void;
}

const ChatDrawerContext = createContext<ChatDrawerState>({
  open: false,
  taskId: null,
  taskTitle: null,
  openChat: () => {},
  closeChat: () => {},
});

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);

  const openChat = useCallback((id: string, title?: string) => {
    setTaskId(id);
    setTaskTitle(title ?? null);
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <ChatDrawerContext.Provider value={{ open, taskId, taskTitle, openChat, closeChat }}>
      {children}
    </ChatDrawerContext.Provider>
  );
}

export const useChatDrawer = () => useContext(ChatDrawerContext);
