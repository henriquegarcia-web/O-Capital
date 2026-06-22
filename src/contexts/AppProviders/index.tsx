import { App as AntApp, ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

import { APP_THEME } from '@/constants';

import { AuthProvider } from '../AuthContext';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: APP_THEME.primaryColor,
        },
        components: {
          Card: {
            bodyPadding: APP_THEME.cardPadding,
            bodyPaddingSM: APP_THEME.cardPadding,
          },
        },
      }}
    >
      <AntApp>
        <AuthProvider>{children}</AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
