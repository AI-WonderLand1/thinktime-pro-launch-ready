import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ThinkTime Pro UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-[#0F172A] p-6 shadow-2xl">
          <AlertTriangle className="w-9 h-9 text-red-400 mb-4" />
          <h1 className="text-xl font-semibold">ThinkTime hit an unexpected screen error.</h1>
          <p className="text-sm text-slate-400 mt-2">Your saved Firebase data was not deleted. Reload the app; if the problem returns, copy the error below for troubleshooting.</p>
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-red-200">{this.state.error.message}</pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            <RefreshCw className="w-4 h-4" /> Reload ThinkTime
          </button>
        </div>
      </div>
    );
  }
}
