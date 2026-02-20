import { Component, Fragment, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
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
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">页面出错了</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error?.message || '发生了未知错误'}
          </p>
          <button
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => this.setState(prev => ({
              hasError: false, error: null, retryCount: prev.retryCount + 1,
            }))}
          >
            重试
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
  }
}
