import { BALANCED_BOARD_SPACES, GAME_BALANCE } from './balance';
import type { BoardSpace, Neighborhood, PropertyBlueprint } from '@/types';

export const BOARD_SIZE = GAME_BALANCE.board.size;
export const START_SPACE_INDEX = GAME_BALANCE.board.startSpaceIndex;

export const NEIGHBORHOODS = [...GAME_BALANCE.neighborhoods] as Neighborhood[];
export const PROPERTY_BLUEPRINTS = [...GAME_BALANCE.propertyBlueprints] as PropertyBlueprint[];
export const BOARD_SPACES = [...BALANCED_BOARD_SPACES] as BoardSpace[];

export const BOARD_SPACES_BY_INDEX = Object.fromEntries(
  BOARD_SPACES.map((space) => [space.index, space]),
) as Record<number, BoardSpace>;

export const EVENT_CARDS = GAME_BALANCE.eventCards;
export const GLOBAL_EVENT_CARDS = GAME_BALANCE.globalEventCards;
