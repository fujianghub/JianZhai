import React, { useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { isLightTheme, useThemeStore } from '@/stores/theme';
import { readThemeAccent } from '@/utils/themeAccent';
import { setMessageInstance } from '@/utils/notify';
import { initCodeBlockGlobalPrefs } from '@/utils/codeBlockPrefs';
import { applyMotionLevel, loadMotionLevel } from '@/utils/motionPref';

// 动效档位在首帧渲染前落 DOM（data-motion）——与主题 data-theme 同一时机，
// 避免「足量首帧 → 精简回跳」的闪动
applyMotionLevel(loadMotionLevel());

/** Captures the App-scoped message instance so `notify.*` calls work app-wide. */
function MessageBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    setMessageInstance(message);
  }, [message]);
  return null;
}

function Root() {
  const { mode } = useThemeStore();
  useEffect(() => {
    initCodeBlockGlobalPrefs();
  }, []);
  const isDark = !isLightTheme(mode);
  // AntD 主色直接读 CSS 的 --jz-accent（唯一来源）；store 在触发本次
  // 重渲之前已把 data-theme 应用到 <html>，此处读到的即目标主题的值。
  const colorPrimary = useMemo(() => readThemeAccent(), [mode]);
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary,
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        },
        components: {
          Layout: {
            // Let our CSS (`[data-theme='…'] .ant-layout`) own the layout
            // background — antd's defaults would otherwise opaquely cover
            // the starry / deep-sea ambient overlay.
            headerBg: 'transparent',
            siderBg: 'transparent',
            bodyBg: 'transparent',
          },
        },
      }}
    >
      <AntdApp>
        <MessageBridge />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
