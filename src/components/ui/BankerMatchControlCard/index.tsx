import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Flex, Form, Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  deleteRoom,
  eliminatePlayer,
  finishGame,
  pauseGame,
  renameRoom,
  reorderPlayers,
  resetGame,
  startGame,
} from '@/api';
import type { GameState, Player, Room } from '@/types';
import { hydrateGameState } from '@/utils';

import { BankActionsCard } from '../BankActionsCard';

type BankerMatchControlCardProps = {
  room: Room;
  players: Player[];
};

type RoomNameFormValues = {
  name: string;
};

type DeleteRoomFormValues = {
  password: string;
};

const GAME_STATUS_LABELS: Record<GameState['status'], string> = {
  waiting: 'Nao iniciado',
  playing: 'Em andamento',
  paused: 'Pausado',
  finished: 'Finalizado',
};

function getPlayerNameClassName(player: Player, turnPlayerId: string | null) {
  if (player.status === 'eliminated') {
    return 'banker-player-name banker-player-name--eliminated';
  }

  if (turnPlayerId === player.id) {
    return 'banker-player-name banker-player-name--current';
  }

  return 'banker-player-name';
}

export function BankerMatchControlCard({ players, room }: BankerMatchControlCardProps) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [roomNameForm] = Form.useForm<RoomNameFormValues>();
  const [deleteRoomForm] = Form.useForm<DeleteRoomFormValues>();
  const game = useMemo<GameState>(() => hydrateGameState(room.game, players), [players, room.game]);
  const orderedPlayers = game.playerOrder
    .map((playerId) => players.find((player) => player.id === playerId))
    .filter((player): player is Player => Boolean(player));

  useEffect(() => {
    roomNameForm.setFieldsValue({ name: room.name });
  }, [room.name, roomNameForm]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    try {
      await action();
      message.success(successMessage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Nao foi possivel concluir a acao.');
    }
  }

  function confirmAction(
    title: string,
    content: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    modal.confirm({
      title,
      content,
      okText: 'Confirmar',
      cancelText: 'Cancelar',
      async onOk() {
        await runAction(action, successMessage);
      },
    });
  }

  function movePlayer(playerId: string, direction: -1 | 1) {
    const currentIndex = game.playerOrder.indexOf(playerId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= game.playerOrder.length) {
      return;
    }

    const nextOrder = [...game.playerOrder];
    const [player] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, player);

    confirmAction(
      'Confirmar ordem',
      'Atualizar a ordem dos jogadores?',
      () => reorderPlayers(room.id, nextOrder),
      'Ordem atualizada.',
    );
  }

  function confirmDeleteRoom() {
    modal.confirm({
      title: 'Deletar sala',
      content: (
        <Form form={deleteRoomForm} layout="vertical">
          <Form.Item
            label="Senha de confirmacao"
            name="password"
            rules={[{ required: true, message: '' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
        </Form>
      ),
      okText: 'Deletar sala',
      okButtonProps: { danger: true },
      cancelText: 'Cancelar',
      async onOk() {
        const values = await deleteRoomForm.validateFields();
        const expectedPassword = import.meta.env.VITE_ROOM_DELETE_PASSWORD;

        if (!expectedPassword || values.password !== expectedPassword) {
          throw new Error('Senha de confirmacao invalida.');
        }

        await deleteRoom(room.id);
        message.success('Sala deletada.');
        navigate('/');
      },
    });
  }

  const columns: ColumnsType<Player> = [
    {
      title: 'Jogador',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (_, player) => (
        <Typography.Text strong className={getPlayerNameClassName(player, game.turnPlayerId)}>
          {player.name}
        </Typography.Text>
      ),
    },
    {
      title: 'Acoes',
      key: 'actions',
      width: 112,
      align: 'right',
      render: (_, player, index) => (
        <Space.Compact>
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            aria-label="Subir jogador"
            disabled={index === 0}
            onClick={() => movePlayer(player.id, -1)}
          />
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            aria-label="Descer jogador"
            disabled={index === orderedPlayers.length - 1}
            onClick={() => movePlayer(player.id, 1)}
          />
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            aria-label="Eliminar jogador"
            disabled={player.status === 'eliminated'}
            onClick={() =>
              confirmAction(
                'Eliminar jogador?',
                'Os titulos desse jogador voltarao ao mercado.',
                () => eliminatePlayer(room.id, player.id),
                'Jogador eliminado.',
              )
            }
          />
        </Space.Compact>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <BankActionsCard room={room} players={players} />

      <Card className="bank-app-card">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex
            justify="space-between"
            align="center"
            gap={12}
            wrap
            className="bank-app-card-header"
          >
            <Typography.Title level={4} style={{ margin: 0 }}>
              Controle de Partida
            </Typography.Title>
            <Tag color={game.status === 'playing' ? 'green' : 'default'}>
              {GAME_STATUS_LABELS[game.status]}
            </Tag>
          </Flex>

          <Flex gap={8} wrap>
            <Button
              type="primary"
              block
              className="banker-control-button"
              icon={game.status === 'playing' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() =>
                game.status === 'playing'
                  ? confirmAction(
                      'Pausar partida?',
                      'A partida ficara pausada para todos os jogadores.',
                      () => pauseGame(room.id),
                      'Partida pausada.',
                    )
                  : confirmAction(
                      'Iniciar partida?',
                      'A rodada e a ordem de jogo serao iniciadas.',
                      () => startGame(room.id),
                      'Partida iniciada.',
                    )
              }
            >
              {game.status === 'playing' ? 'Pausar' : 'Iniciar'}
            </Button>
            <Button
              block
              className="banker-control-button"
              icon={<ReloadOutlined />}
              disabled={game.status !== 'playing'}
              onClick={() =>
                confirmAction(
                  'Reiniciar partida?',
                  'Todo o estado da partida sera reiniciado.',
                  () => resetGame(room.id),
                  'Partida reiniciada.',
                )
              }
            >
              Reiniciar
            </Button>
            <Button
              danger
              block
              className="banker-control-button"
              icon={<StopOutlined />}
              onClick={() =>
                confirmAction(
                  'Finalizar partida?',
                  'A partida sera marcada como finalizada.',
                  () => finishGame(room.id),
                  'Partida finalizada.',
                )
              }
            >
              Finalizar
            </Button>
          </Flex>

          <Table
            rowKey="id"
            size="small"
            className="banker-players-table"
            tableLayout="fixed"
            pagination={false}
            columns={columns}
            dataSource={orderedPlayers}
            scroll={{ x: 292 }}
          />
        </Space>
      </Card>

      <Card className="bank-app-card">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex
            align="center"
            justify="space-between"
            gap={12}
            wrap
            className="bank-app-card-header"
          >
            <Typography.Title level={4} style={{ margin: 0 }}>
              Configuracoes
            </Typography.Title>
          </Flex>

          <Form
            form={roomNameForm}
            layout="vertical"
            initialValues={{ name: room.name }}
            onFinish={(values) =>
              confirmAction(
                'Renomear sala?',
                `Alterar o nome da sala para "${values.name}"?`,
                () => renameRoom(room.id, values.name),
                'Nome da sala atualizado.',
              )
            }
          >
            <Flex align="flex-end" gap={8} wrap>
              <Form.Item
                label="Nome da sala"
                name="name"
                rules={[{ required: true, min: 3, message: '' }]}
                style={{ flex: '1 1 220px', marginBottom: 0 }}
              >
                <Input />
              </Form.Item>
              <Button htmlType="submit" className="banker-config-submit">
                Redefinir
              </Button>
            </Flex>
          </Form>

          <Button danger block icon={<DeleteOutlined />} onClick={confirmDeleteRoom}>
            Deletar sala
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
