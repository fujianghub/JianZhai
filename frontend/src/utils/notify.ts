/**
 * Theme-aware drop-in replacement for AntD's static `message` API.
 *
 * AntD warns when you use the static `message` import because it can't read the
 * theme/locale from a higher-level <ConfigProvider>. The fix is to call
 * `App.useApp()` inside a React tree to get a scoped MessageInstance. We capture
 * that instance once at app boot and expose the familiar `notify.success(...)`
 * shape so callers don't all need to switch to hooks.
 */
import type { MessageInstance } from 'antd/es/message/interface';

let _msg: MessageInstance | null = null;

export function setMessageInstance(m: MessageInstance): void {
  _msg = m;
}

type Args = Parameters<MessageInstance['success']>;

function wrap(method: keyof MessageInstance) {
  return (...args: Args) => {
    if (_msg) {
      // @ts-expect-error — variadic forwarding
      return _msg[method](...args);
    }
    // Pre-boot fallback so a very early call doesn't throw.
    if (typeof console !== 'undefined') console.warn(`[notify.${String(method)} before mount]`, args);
    return undefined;
  };
}

export const message = {
  success: wrap('success'),
  error: wrap('error'),
  info: wrap('info'),
  warning: wrap('warning'),
  loading: wrap('loading'),
  open: wrap('open'),
};
