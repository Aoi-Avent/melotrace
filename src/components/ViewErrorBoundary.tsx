import React from 'react';

interface Props {
  label?: string;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/** 画面単位の小さな ErrorBoundary。落ちた場合はエラー文をその場に表示する（アプリ全体は落とさない） */
export class ViewErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.label ?? 'View'}] crashed:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="ios-scroll-container pb-44 pt-6 px-5 max-w-lg mx-auto">
        <p className="text-[15px] font-semibold text-fg mb-2">{this.props.label ?? '画面'}の表示中にエラーが発生しました</p>
        <pre className="text-[12px] text-muted whitespace-pre-wrap break-words select-text">
          {String(error?.message ?? error)}
          {error?.stack ? `\n\n${error.stack.split('\n').slice(0, 6).join('\n')}` : ''}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-4 px-4 py-2 rounded-full bg-fg text-inverse text-[13px] font-semibold"
        >
          再試行
        </button>
      </div>
    );
  }
}
