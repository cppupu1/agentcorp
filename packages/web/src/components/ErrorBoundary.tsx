import { Component, Fragment, type ReactNode } from 'react';
import { useI18n } from '@/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 className="text-xl font-semibold mb-2">{t('common.pageError')}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {error?.message || t('common.unknownError')}
      </p>
      <button
        className="px-6 py-2 text-sm rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        onClick={onRetry}
      >
        {t('common.retry')}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState(prev => ({
            hasError: false, error: null, retryCount: prev.retryCount + 1,
          }))}
        />
      );
    }
    return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
  }
}
