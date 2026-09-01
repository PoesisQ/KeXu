import React from 'react';
import { APP_NAME } from '../config';

export class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`${APP_NAME} render failure`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-error">
      <img src="/icon-kexu.png" alt="" />
      <h1>{APP_NAME} 暂时无法显示</h1>
      <p>课表数据仍保存在本机。重新打开应用通常即可恢复。</p>
      <button onClick={() => window.location.reload()}>重新加载</button>
    </main>;
  }
}
