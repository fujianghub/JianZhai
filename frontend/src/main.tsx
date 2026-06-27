import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useThemeStore } from '@/stores/theme';
import { setMessageInstance } from '@/utils/notify';
import { initCodeBlockGlobalPrefs } from '@/utils/codeBlockPrefs';

/** Captures the App-scoped message instance so `notify.*` calls work app-wide. */
function MessageBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    setMessageInstance(message);
  }, [message]);
  return null;
}

/** Accent + dark-mode classification for the four theme modes. The 'starry'
 * and 'deepsea' modes have palettes hard-coded in CSS (theme.css), so antd
 * gets a fixed accent matching them; light/dark honour the user's chosen
 * accent preset. */
const MODE_ACCENT: Record<string, string | null> = {
  // Must match --jz-accent in tokens.css so AntD's colorPrimary and the
  // CSS-variable-driven UI agree under these bespoke palettes.
  starry: '#d9a6ff',
  deepsea: '#6ff8e4',
};
const DARK_MODES = new Set(['dark', 'starry', 'deepsea']);

function Root() {
  const { mode, accent } = useThemeStore();
  useEffect(() => {
    initCodeBlockGlobalPrefs();
  }, []);
  const isDark = DARK_MODES.has(mode);
  const colorPrimary = MODE_ACCENT[mode] ?? accent.color;
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
