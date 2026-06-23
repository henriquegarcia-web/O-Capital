import { zodResolver } from '@hookform/resolvers/zod';
import { App, Button, Card, Flex, Form, Space, Typography } from 'antd';
import { useForm } from 'react-hook-form';

import {
  ControlledProfileColorSelect,
  ControlledProfilePhotoSelect,
  ControlledTextInput,
} from '@/components/forms';
import { PROFILE_COLORS, PROFILE_PHOTOS } from '@/constants';
import { createPlayerSchema, type CreatePlayerInput } from '@/schemas';

type PlayerJoinCardProps = {
  disabledColorKeys?: string[];
  framed?: boolean;
  loading?: boolean;
  onJoin: (input: CreatePlayerInput) => Promise<void> | void;
};

export function PlayerJoinCard({
  disabledColorKeys = [],
  framed = true,
  loading,
  onJoin,
}: PlayerJoinCardProps) {
  const { modal } = App.useApp();
  const {
    control,
    formState: { isValid },
    handleSubmit,
    reset,
  } = useForm<CreatePlayerInput>({
    defaultValues: {
      name: '',
      photoKey: PROFILE_PHOTOS[0]?.key,
      colorKey: PROFILE_COLORS.find((color) => !disabledColorKeys.includes(color.key))?.key,
    },
    mode: 'onChange',
    resolver: zodResolver(createPlayerSchema),
  });

  const handleJoin = handleSubmit((values) => {
    modal.confirm({
      title: 'Entrar na sala?',
      content: `Criar o jogador "${values.name}" e entrar na sala?`,
      okText: 'Entrar',
      cancelText: 'Cancelar',
      async onOk() {
        await onJoin(values);
        reset({
          name: '',
          photoKey: PROFILE_PHOTOS[0]?.key,
          colorKey: PROFILE_COLORS.find((color) => !disabledColorKeys.includes(color.key))?.key,
        });
      },
    });
  });

  const content = (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {framed ? (
        <Typography.Title level={4} style={{ margin: 0 }}>
          Novo jogador
        </Typography.Title>
      ) : null}
      <Form layout="vertical" onFinish={handleJoin}>
        <Flex vertical gap={12}>
          <ControlledProfilePhotoSelect control={control} name="photoKey" label="Foto de perfil" />
          <ControlledTextInput control={control} name="name" label="Nome do jogador" />
          <ControlledProfileColorSelect
            control={control}
            name="colorKey"
            label="Cor do perfil"
            disabledColorKeys={disabledColorKeys}
          />
          <Button type="primary" htmlType="submit" loading={loading} disabled={!isValid} block>
            Entrar
          </Button>
        </Flex>
      </Form>
    </Space>
  );

  if (!framed) {
    return content;
  }

  return <Card className="bank-app-card">{content}</Card>;
}
