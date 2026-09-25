import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[350px] flex-col items-center justify-center p-8 text-center rounded-2xl border border-destructive/20 bg-destructive/5 backdrop-blur-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {this.props.fallbackTitle || 'Something went wrong loading this section'}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {this.props.fallbackDescription ||
              'An unexpected error occurred while rendering this component. You can retry to reload.'}
          </p>
          {this.state.error && (
            <p className="mt-2 text-xs font-mono bg-destructive/10 text-destructive px-3 py-1 rounded max-w-lg truncate">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
            <Button size="sm" onClick={this.handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
