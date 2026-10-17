import { Component, type ErrorInfo, type ReactNode } from 'react'
import ErrorScreen from './ErrorScreen'

/** Catches errors thrown while rendering and shows the themed error page instead of a blank screen. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // the browser console is the only place for the detail; nothing is sent anywhere
    console.error('Render error', error, info.componentStack)
  }

  render() {
    return this.state.failed ? <ErrorScreen kind="error" /> : this.props.children
  }
}
