import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("INChat could not render this screen:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <main className="render-error-screen" role="alert">
        <section className="render-error-card">
          <div className="brand-mark">IN</div>
          <h1>This screen could not be displayed</h1>
          <p>Your saved account and messages are unchanged. Reload INChat to try again.</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>Reload INChat</button>
        </section>
      </main>;
    }

    return this.props.children;
  }
}
