"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[boundary]", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
            <LogoMark className="mx-auto size-10" />
            <h1 className="mt-4 font-heading text-lg font-semibold">
              Kuch galat ho gaya
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This section crashed unexpectedly. Reload karke dobara try karo.
            </p>
            {this.state.message ? (
              <p className="mt-3 break-words rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                {this.state.message}
              </p>
            ) : null}
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button onClick={this.reset}>Try again</Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}