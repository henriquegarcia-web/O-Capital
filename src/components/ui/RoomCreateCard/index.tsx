import { zodResolver } from '@hookform/resolvers/zod';
import { App, Button, Card, Flex, Form, Space, Typography } from 'antd';
import { useForm } from 'react-hook-form';

import { ControlledTextInput } from '@/components/forms';
import { APP_ICONS } from '@/constants';
import { createRoomSchema, type CreateRoomInput } from '@/schemas';

type RoomCreateCardProps = {
  loading?: boolean;
  onCreate: (input: CreateRoomInput) => Promise<void> | void;
};

export function RoomCreateCard({ loading, onCreate }: RoomCreateCardProps) {
  const { modal } = App.useApp();
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
  } = useForm<CreateRoomInput>({
    defaultValues: {
      name: '',
    },
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(createRoomSchema),
  });

  const handleCreate = handleSubmit((values) => {
    modal.confirm({
      title: 'Criar sala?',
      content: `Criar a sala "${values.name}"?`,
      okText: 'Criar',
      cancelText: 'Cancelar',
      async onOk() {
        await onCreate(values);
        reset();
      },
    });
  });

  return (
    <Card className="bank-app-card bank-app-card--dark">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Criar sala
        </Typography.Title>
        <Typography.Text style={{ color: 'rgb(255 255 255 / 72%)' }}>
          Abra uma nova mesa e convide os jogadores.
        </Typography.Text>
        <Form layout="vertical" onFinish={handleCreate}>
          <Flex vertical gap={12}>
            <ControlledTextInput control={control} name="name" label="Nome da sala" />
            <Button
              type="primary"
              htmlType="submit"
              loading={loading || isSubmitting}
              block
              icon={<APP_ICONS.plus />}
            >
              Criar
            </Button>
          </Flex>
        </Form>
      </Space>
    </Card>
  );
}
