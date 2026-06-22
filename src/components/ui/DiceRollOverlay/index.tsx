import { Flex, Typography } from 'antd';

export type DiceRollOverlayPhase = 'rolling' | 'result' | 'exiting';

type DiceRollOverlayProps = {
  open: boolean;
  phase: DiceRollOverlayPhase;
  result: { diceOne: number; diceTwo: number } | null;
};

type Pip =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-right';

type DiceFaceProps = {
  side: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
  pips: Pip[];
};

const DICE_PIPS: Record<number, Pip[]> = {
  1: ['center'],
  2: ['top-left', 'bottom-right'],
  3: ['top-left', 'center', 'bottom-right'],
  4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
  6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
};

function DiceFace({ pips, side }: DiceFaceProps) {
  return (
    <span className={`dice-roll-overlay__face dice-roll-overlay__face--${side}`}>
      {pips.map((pip) => (
        <span key={pip} className={`dice-roll-overlay__pip dice-roll-overlay__pip--${pip}`} />
      ))}
    </span>
  );
}

function DiceCube({
  delay = false,
  phase,
  value,
}: {
  delay?: boolean;
  phase: DiceRollOverlayPhase;
  value: number;
}) {
  const sceneClassName = delay
    ? 'dice-roll-overlay__die-scene dice-roll-overlay__die-scene--delay'
    : 'dice-roll-overlay__die-scene';
  const cubeClassName =
    phase === 'rolling'
      ? 'dice-roll-overlay__die-cube'
      : 'dice-roll-overlay__die-cube dice-roll-overlay__die-cube--settled';

  return (
    <div className={sceneClassName}>
      <div className={cubeClassName}>
        <DiceFace side="front" pips={DICE_PIPS[value]} />
        <DiceFace side="back" pips={DICE_PIPS[7 - value]} />
        <DiceFace side="right" pips={DICE_PIPS[value === 6 ? 3 : value + 1]} />
        <DiceFace side="left" pips={DICE_PIPS[value === 1 ? 4 : value - 1]} />
        <DiceFace side="top" pips={DICE_PIPS[value >= 5 ? 2 : value + 2]} />
        <DiceFace side="bottom" pips={DICE_PIPS[value <= 2 ? 5 : value - 2]} />
      </div>
    </div>
  );
}

export function DiceRollOverlay({ open, phase, result }: DiceRollOverlayProps) {
  if (!open) {
    return null;
  }

  const firstDie = result?.diceOne ?? 1;
  const secondDie = result?.diceTwo ?? 2;
  const overlayClassName =
    phase === 'exiting' ? 'dice-roll-overlay dice-roll-overlay--exiting' : 'dice-roll-overlay';

  return (
    <div className={overlayClassName} aria-live="polite">
      <Flex vertical align="center" gap={18} className="dice-roll-overlay__content">
        <Flex gap={18}>
          <DiceCube phase={phase} value={firstDie} />
          <DiceCube delay phase={phase} value={secondDie} />
        </Flex>
        <Typography.Text strong className="dice-roll-overlay__label">
          {phase === 'rolling'
            ? 'Girando dados'
            : `${firstDie} + ${secondDie} = ${firstDie + secondDie}`}
        </Typography.Text>
      </Flex>
    </div>
  );
}
