import { App, Button, Card, Flex, Form, Input, Segmented, Select, Space, Typography } from 'antd';

import { applyBankBalanceAction } from '@/api';
import { APP_ICONS } from '@/constants';
import type { Player, Room } from '@/types';
import { formatMoney } from '@/utils';
import { MoneyInput } from '../MoneyInput';

type BankActionsCardProps = {
  room: Room;
  players: Player[];
};

type BankActionFormValues = {
  playerId: string;
  reason: string;
  amount: number;
  action: 'add' | 'subtract';
};

export function BankActionsCard({ players, room }: BankActionsCardProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<BankActionFormValues>();
  const activePlayers = players.filter((player) => player.status !== 'eliminated');

  async function handleSubmit(values: BankActionFormValues) {
    const targetPlayer = players.find((player) => player.id === values.playerId);

    modal.confirm({
      title: 'Confirmar acao do banco',
      content: `${values.action === 'add' ? 'Somar' : 'Subtrair'} ${formatMoney(
        values.amount,
      )} para ${targetPlayer?.name ?? 'jogador'}?`,
      okText: 'Confirmar',
      cancelText: 'Cancelar',
      async onOk() {
        try {
          await applyBankBalanceAction(room.id, values.playerId, {
            action: values.action,
            amount: values.amount,
            reason: values.reason,
          });
          message.success('Acao do banco aplicada.');
          form.resetFields();
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Nao foi possivel aplicar a acao.',
          );
        }
      },
    });
  }

  return (
    <Card className="bank-app-card">
      <Space orientation="vertical" size={14} style={{ width: '100%' }}>
        <Flex align="center" gap={10} wrap className="bank-app-card-header">
          <APP_ICONS.bank className="bank-actions-card__icon" />
          <Typography.Title level={4} style={{ margin: 0 }}>
            Acoes do Banco
          </Typography.Title>
        </Flex>

        <Form
          form={form}
          layout="vertical"
          initialValues={{ action: 'add' }}
          onFinish={handleSubmit}
        >
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Flex gap={12} wrap align="flex-start">
              <Form.Item
                label="Destino"
                name="playerId"
                rules={[{ required: true, message: '' }]}
                className="bank-actions-card__field bank-actions-card__field--player"
              >
                <Select
                  placeholder="Selecione"
                  options={activePlayers.map((player) => ({
                    value: player.id,
                    label: player.name,
                  }))}
                />
              </Form.Item>

              <Form.Item
                label="Valor"
                name="amount"
                rules={[{ required: true, message: '' }]}
                className="bank-actions-card__field bank-actions-card__field--amount"
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Button disabled className="money-input-prefix">
                    R$
                  </Button>
                  <MoneyInput min={1} placeholder="0" style={{ width: '100%' }} />
                </Space.Compact>
              </Form.Item>
            </Flex>

            <Form.Item
              label="Motivo"
              name="reason"
              rules={[
                { required: true, message: '' },
                { min: 3, message: '' },
              ]}
              className="bank-actions-card__field bank-actions-card__field--full"
            >
              <Input placeholder="Ex.: bonus, taxa, ajuste manual" />
            </Form.Item>

            <Form.Item
              label="Acao"
              name="action"
              rules={[{ required: true, message: '' }]}
              className="bank-actions-card__field bank-actions-card__field--full"
            >
              <Segmented
                block
                options={[
                  { label: 'Somar', value: 'add', icon: <APP_ICONS.plusCircle /> },
                  { label: 'Subtrair', value: 'subtract', icon: <APP_ICONS.minusCircle /> },
                ]}
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" block>
              Aplicar acao
            </Button>
          </Space>
        </Form>
      </Space>
    </Card>
  );
}