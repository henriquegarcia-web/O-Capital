import { useMemo, useState } from 'react';
import { App, Button, Card, Collapse, Flex, Progress, Space, Tag, Typography } from 'antd';

import { claimMissionReward } from '@/api';
import { APP_ICONS } from '@/constants';
import type { GameState, Player, Room } from '@/types';
import {
  formatMoney,
  getAdvantageDefinition,
  getMissionProgress,
  isMissionClaimed,
  isMissionCompleted,
  isPlayerActionBlocked,
  MISSIONS_BY_CATEGORY,
} from '@/utils';
import type { MissionDefinition, MissionReward } from '@/utils';

type MissionsMenuPanelProps = {
  room: Room;
  game: GameState;
  currentPlayer: Player;
};

function formatReward(reward: MissionReward) {
  if (reward.type === 'cash') {
    return `+ ${formatMoney(reward.amount)}`;
  }

  const definition = getAdvantageDefinition(reward.advantageKey);

  return `+ ${reward.quantity} ${definition?.name ?? 'Vantagem'}`;
}

function formatProgressValue(mission: MissionDefinition, progress: number) {
  if (mission.target >= 100000) {
    return `${formatMoney(Math.min(progress, mission.target))} / ${formatMoney(mission.target)}`;
  }

  return `${Math.min(progress, mission.target)} / ${mission.target}`;
}

function getMissionShortTitle(mission: MissionDefinition) {
  const labels: Partial<Record<MissionDefinition['key'], string>> = {
    'first-title': 'Terreno',
    'first-property': 'Construcao',
    'first-rent': 'Aluguel',
    'first-investment': 'Investimento',
    'fortune-100k': 'Fortuna 100k',
    'fortune-250k': 'Fortuna 250k',
    'fortune-500k': 'Fortuna 500k',
    'sell-title-player': 'Venda',
    'buy-title-player': 'Compra',
    'three-streets-neighborhood': 'Bairro',
    'five-hotels': 'Hoteis',
    'five-businesses': 'Empreendimentos',
  };

  return labels[mission.key] ?? mission.title.split(' ').slice(0, 2).join(' ');
}

export function MissionsMenuPanel({ currentPlayer, game, room }: MissionsMenuPanelProps) {
  const { message } = App.useApp();
  const [claimingMissionKey, setClaimingMissionKey] = useState<string | null>(null);
  const actionBlocked = isPlayerActionBlocked(game, currentPlayer.id);
  const missionStats = useMemo(() => {
    const missions = MISSIONS_BY_CATEGORY.flatMap((category) => category.missions);
    const completed = missions.filter((mission) =>
      isMissionCompleted(game, currentPlayer.id, mission),
    ).length;
    const claimed = missions.filter((mission) =>
      isMissionClaimed(game, currentPlayer.id, mission.key),
    ).length;

    return {
      total: missions.length,
      completed,
      claimed,
      available: Math.max(0, completed - claimed),
    };
  }, [currentPlayer.id, game]);

  async function handleClaim(mission: MissionDefinition) {
    setClaimingMissionKey(mission.key);

    try {
      await claimMissionReward(room.id, currentPlayer.id, mission.key);
      message.success('Recompensa resgatada.');
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Nao foi possivel resgatar a recompensa.',
      );
    } finally {
      setClaimingMissionKey(null);
    }
  }

  function renderMission(mission: MissionDefinition) {
    const progress = getMissionProgress(game, currentPlayer.id, mission);
    const completed = isMissionCompleted(game, currentPlayer.id, mission);
    const claimed = isMissionClaimed(game, currentPlayer.id, mission.key);
    const percent = Math.min(100, Math.round((progress / mission.target) * 100));

    return (
      <Card key={mission.key} className="bank-app-card mission-card" size="small">
        <Space orientation="vertical" size={12} className="mission-card__content">
          <Flex align="center" justify="space-between" gap={10}>
            <Space size={10} align="center" className="mission-card__identity">
              <span
                className={
                  completed
                    ? 'board-space-property-icon board-space-property-icon--active'
                    : 'board-space-property-icon'
                }
              >
                {completed ? <APP_ICONS.checkCircle /> : <APP_ICONS.trophy />}
              </span>
              <Typography.Title level={5} className="mission-card__title">
                {getMissionShortTitle(mission)}
              </Typography.Title>
            </Space>
            <Tag color={claimed ? 'default' : completed ? 'green' : 'orange'}>
              {claimed ? 'Resgatada' : completed ? 'Pronta' : 'Em progresso'}
            </Tag>
          </Flex>

          <Flex vertical gap={4} className="mission-card__copy">
            <Typography.Text className="mission-card__description">{mission.title}</Typography.Text>
            <Flex align="center" justify="space-between" gap={10} wrap>
              <Typography.Text type="secondary">Recompensa</Typography.Text>
              <Typography.Text className="mission-card__reward">
                {formatReward(mission.reward)}
              </Typography.Text>
            </Flex>
          </Flex>

          <Space orientation="vertical" size={6} className="mission-card__progress">
            <Flex justify="space-between" gap={12}>
              <Typography.Text type="secondary">Progresso</Typography.Text>
              <Typography.Text strong>{formatProgressValue(mission, progress)}</Typography.Text>
            </Flex>
            <Progress
              percent={percent}
              showInfo={false}
              status={completed ? 'success' : 'active'}
            />
          </Space>

          <Button
            type="primary"
            block
            disabled={actionBlocked || !completed || claimed}
            loading={claimingMissionKey === mission.key}
            icon={
              actionBlocked ? (
                <APP_ICONS.lock />
              ) : claimed ? (
                <APP_ICONS.checkCircle />
              ) : (
                <APP_ICONS.gift />
              )
            }
            onClick={() => void handleClaim(mission)}
          >
            {claimed ? 'Recompensa resgatada' : 'Resgatar recompensa'}
          </Button>
        </Space>
      </Card>
    );
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className="bank-app-card bank-app-card--dark bank-menu-summary">
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Flex align="center" justify="space-between" gap={12} wrap>
            <Space size={10} className="bank-app-card-header">
              <APP_ICONS.safetyCertificate />
              <Typography.Title level={4} style={{ margin: 0 }}>
                Missoes
              </Typography.Title>
            </Space>
            <Tag color={missionStats.available > 0 ? 'green' : 'default'}>
              {missionStats.available} para resgatar
            </Tag>
          </Flex>

          <Flex gap={10} wrap>
            <div className="mission-summary-metric">
              <Typography.Text className="mission-summary-metric__label">
                Concluidas
              </Typography.Text>
              <Typography.Text className="mission-summary-metric__value">
                {missionStats.completed} / {missionStats.total}
              </Typography.Text>
            </div>
            <div className="mission-summary-metric">
              <Typography.Text className="mission-summary-metric__label">
                Resgatadas
              </Typography.Text>
              <Typography.Text className="mission-summary-metric__value">
                {missionStats.claimed}
              </Typography.Text>
            </div>
          </Flex>
        </Space>
      </Card>

      {MISSIONS_BY_CATEGORY.map((category) => {
        const completedCount = category.missions.filter((mission) =>
          isMissionCompleted(game, currentPlayer.id, mission),
        ).length;

        return (
          <Collapse
            key={category.key}
            className="bank-app-card bank-section-collapse"
            defaultActiveKey={category.key === 'initial' ? [category.key] : undefined}
            items={[
              {
                key: category.key,
                label: (
                  <Flex align="center" justify="space-between" gap={10}>
                    <span>{category.label}</span>
                    <Tag color={completedCount === category.missions.length ? 'green' : 'default'}>
                      {completedCount}/{category.missions.length}
                    </Tag>
                  </Flex>
                ),
                children: (
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    {category.missions.map(renderMission)}
                  </Space>
                ),
              },
            ]}
          />
        );
      })}
    </Space>
  );
}
