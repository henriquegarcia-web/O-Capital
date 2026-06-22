import {
  BankOutlined,
  HomeOutlined,
  ShopOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { Card, Descriptions, Flex, Space, Tag, Tooltip, Typography } from 'antd';

import { BOARD_SPACES_BY_INDEX } from '@/constants';
import type { GameState, Player } from '@/types';

type CurrentBoardSpaceCardProps = {
  game: GameState;
  currentPlayer: Player;
  players: Player[];
};

function getOwnerName(ownerId: string | null | undefined, players: Player[]) {
  if (!ownerId) {
    return null;
  }

  return players.find((player) => player.id === ownerId)?.name ?? 'Outro jogador';
}

export function CurrentBoardSpaceCard({
  currentPlayer,
  game,
  players,
}: CurrentBoardSpaceCardProps) {
  const position = game.positions[currentPlayer.id] ?? 1;
  const boardSpace = BOARD_SPACES_BY_INDEX[position] ?? BOARD_SPACES_BY_INDEX[1];
  const title = game.titles?.[String(boardSpace.index)];
  const ownerName = getOwnerName(title?.ownerId, players);
  const isStreet = boardSpace.kind === 'street';
  const status = isStreet
    ? ownerName
      ? `${ownerName} e dono desse terreno`
      : 'Disponivel para compra'
    : 'Casa especial estruturada para logica futura';

  return (
    <Card>
      <Space orientation="vertical" size={14} style={{ width: '100%' }}>
        <Flex align="flex-start" justify="space-between" gap={12} wrap>
          <Flex align="center" gap={10} className="board-space-heading">
            <span
              className="board-space-color"
              style={{ backgroundColor: boardSpace.color }}
              aria-label="Cor da casa"
            />
            <Typography.Title level={5} style={{ margin: 0 }}>
              {boardSpace.name}
            </Typography.Title>
          </Flex>
          <Tag color={isStreet ? 'blue' : 'purple'}>{isStreet ? 'Título' : 'Ação'}</Tag>
        </Flex>

        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Status">{status}</Descriptions.Item>
          {isStreet ? (
            <Descriptions.Item label="Terreno">
              {boardSpace.landValue ? `R$ ${boardSpace.landValue.toLocaleString('pt-BR')}` : 'Valor pendente'}
            </Descriptions.Item>
          ) : null}
        </Descriptions>

        {title?.ownerId ? (
          <Flex gap={10} align="center">
            {(title.properties ?? []).length > 0 ? (
              title.properties?.map((property, index) => (
                <Tooltip key={`${property.blueprintKey}-${index}`} title={property.blueprintKey}>
                  {property.blueprintKey.includes('comercio') ||
                  property.blueprintKey.includes('loja') ||
                  property.blueprintKey.includes('empreendimento') ? (
                    <ShopOutlined className="board-space-business-icon" />
                  ) : (
                    <HomeOutlined className="board-space-business-icon" />
                  )}
                </Tooltip>
              ))
            ) : (
              <Tooltip title="Terreno sem propriedades">
                <BankOutlined className="board-space-business-icon" />
              </Tooltip>
            )}
            <Tooltip title="Negociavel">
              <ShoppingOutlined className="board-space-business-icon" />
            </Tooltip>
          </Flex>
        ) : null}
      </Space>
    </Card>
  );
}
