import { Layout, Typography } from 'antd';
import { Outlet } from 'react-router-dom';

const { Header, Content, Footer } = Layout;

export function AppLayout() {
  return (
    <Layout className="app-layout">
      <Header className="app-layout__header">
        <Typography.Title level={4} className="app-layout__title">
          O Capital
        </Typography.Title>
      </Header>
      <Content className="app-layout__content">
        <Outlet />
      </Content>
      <Footer className="app-layout__footer">O Capital</Footer>
    </Layout>
  );
}
