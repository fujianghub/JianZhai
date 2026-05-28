import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  /** Optional fallback render override. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
  /** Optional context tag (e.g. route name) for the dev-only console log. */
  context?: string;
}

interface State {
  err: Error | null;
}

/**
 * Route-level error boundary. Catches synchronous render errors AND lazy-chunk
 * fetch failures from `React.lazy` so a flaky deploy / network blip doesn't
 * leave the user staring at a blank page. Reset clears the boundary so the
 * user can retry without a full reload.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // Dev visibility only; do not ship to a remote logger from a personal app.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(`[ErrorBoundary${this.props.context ? `:${this.props.context}` : ''}]`, err, info);
    }
  }

  reset = () => this.setState({ err: null });

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(err, this.reset);
    }

    const isChunkLoad = /Loading chunk|Failed to fetch dynamically imported/i.test(err.message);
    return (
      <Result
        status={isChunkLoad ? 'warning' : 'error'}
        title={isChunkLoad ? '页面资源加载失败' : '出错了'}
        subTitle={
          isChunkLoad
            ? '网络可能不稳定,或者刚刚部署了新版本。点击重试。'
            : err.message || '发生了意外的错误,请重试或返回首页。'
        }
        extra={[
          <Button key="retry" type="primary" icon={<ReloadOutlined />} onClick={this.reset}>
            重试
          </Button>,
          <Button key="reload" onClick={() => window.location.reload()}>
            刷新页面
          </Button>,
        ]}
      />
    );
  }
}
