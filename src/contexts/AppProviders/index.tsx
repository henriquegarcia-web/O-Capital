import { App as AntApp, ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

import { APP_THEME } from '@/constants';

import { AuthProvider } from '../AuthContext';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      form={{ requiredMark: false }}
      theme={{
        token: {
          colorPrimary: APP_THEME.primaryColor,
          colorSuccess: APP_THEME.colors.success,
          colorError: APP_THEME.colors.danger,
          colorText: APP_THEME.colors.text,
          colorTextSecondary: APP_THEME.colors.mutedText,
          colorBorder: APP_THEME.colors.border,
          colorBgLayout: APP_THEME.colors.appBackground,
          colorBgContainer: APP_THEME.colors.surface,
          borderRadius: 8,
          borderRadiusLG: 8,
          boxShadow: '0 12px 30px rgb(6 37 31 / 14%)',
          fontSize: 14,
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 42,
            controlHeightSM: 34,
            fontWeight: 700,
            primaryShadow: '0 12px 24px rgb(255 122 0 / 28%)',
          },
          Card: {
            bodyPadding: APP_THEME.cardPadding,
            bodyPaddingSM: APP_THEME.cardPadding,
            borderRadiusLG: 8,
            boxShadowTertiary: '0 10px 26px rgb(6 37 31 / 10%)',
          },
          Input: {
            borderRadius: 8,
            controlHeight: 42,
          },
          InputNumber: {
            borderRadius: 8,
            controlHeight: 42,
          },
          Modal: {
            borderRadiusLG: 8,
          },
          Select: {
            borderRadius: 8,
            controlHeight: 42,
          },
          Table: {
            borderColor: APP_THEME.colors.border,
            headerBg: APP_THEME.colors.surfaceMuted,
            headerColor: APP_THEME.colors.mutedText,
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
