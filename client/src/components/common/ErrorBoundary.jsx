// src/components/common/ErrorBoundary.jsx
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) { console.error('UI error boundary:', err, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 border rounded bg-rose-50 text-rose-700">
          <div className="font-semibold">This section failed to load.</div>
          <pre className="text-xs mt-2 overflow-auto">{String(this.state.error.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
