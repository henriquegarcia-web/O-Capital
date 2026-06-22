import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Flex, Form, Space, Typography } from 'antd';
import { useForm } from 'react-hook-form';

import { ControlledTextInput } from '@/components/forms';
import { createRoomSchema, type CreateRoomInput } from '@/schemas';

type RoomCreateCardProps = {
  loading?: boolean;
  onCreate: (input: CreateRoomInput) => Promise<void> | void;
};

export function RoomCreateCard({ loading, onCreate }: RoomCreateCardProps) {
  const {
    control,
    formState: { isValid },
    handleSubmit,
    reset,
  } = useForm<CreateRoomInput>({
    defaultValues: {
      name: '',
    },
    mode: 'onChange',
    resolver: zodResolver(createRoomSchema),
  });

  const handleCreate = handleSubmit(async (values) => {
    await onCreate(values);
    reset();
  });

  return (
    <Card>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Criar sala
        </Typography.Title>
        <Form layout="vertical" onFinish={handleCreate}>
          <Flex vertical gap={12}>
            <ControlledTextInput control={control} name="name" label="Nome da sala" />
            <Button type="primary" htmlType="submit" loading={loading} disabled={!isValid} block>
              Criar
            </Button>
          </Flex>
        </Form>
      </Space>
    </Card>
  );
}
