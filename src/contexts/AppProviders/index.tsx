import { App as AntApp, ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

import { AuthProvider } from '../AuthContext';

const primaryColor = '#1f7a5f';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: primaryColor,
        },
      }}
    >
      <AntApp>
        <AuthProvider>{children}</AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
