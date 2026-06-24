import type { BoardSpace, Neighborhood, PropertyBlueprint } from '@/types';

export const BOARD_SIZE = 40;
export const START_SPACE_INDEX = 1;

export const NEIGHBORHOODS: Neighborhood[] = [
  { key: 'ponta-negra', name: 'Ponta Negra', color: '#00A6D6', bonusTarget: 'real-estate' },
  { key: 'capim-macio', name: 'Capim Macio', color: '#39BFA7', bonusTarget: 'business' },
  { key: 'lagoa-nova', name: 'Lagoa Nova', color: '#F28C28', bonusTarget: 'business' },
  { key: 'candelaria', name: 'Candelaria', color: '#7B4DFF', bonusTarget: 'real-estate' },
  { key: 'tirol', name: 'Tirol', color: '#D4AF37', bonusTarget: 'real-estate' },
  { key: 'alecrim', name: 'Alecrim', color: '#D62828', bonusTarget: 'business' },
  { key: 'cidade-alta', name: 'Cidade Alta', color: '#9C6644', bonusTarget: 'business' },
];

export const PROPERTY_BLUEPRINTS: PropertyBlueprint[] = [
  {
    key: 'flat',
    name: 'Flat',
    category: 'real-estate',
    level: 1,
    constructionCost: 5000,
    maintenanceCost: 500,
    maintenanceIntervalRounds: 5,
    rent: 1500,
    taxRate: 0.1,
  },
  {
    key: 'casa',
    name: 'Casa',
    category: 'real-estate',
    level: 2,
    constructionCost: 10000,
    maintenanceCost: 1000,
    maintenanceIntervalRounds: 5,
    rent: 2500,
    taxRate: 0.1,
  },
  {
    key: 'pousada',
    name: 'Pousada',
    category: 'real-estate',
    level: 3,
    constructionCost: 25000,
    maintenanceCost: 2500,
    maintenanceIntervalRounds: 5,
    rent: 5000,
    taxRate: 0.1,
  },
  {
    key: 'hotel',
    name: 'Hotel',
    category: 'real-estate',
    level: 4,
    constructionCost: 50000,
    maintenanceCost: 5000,
    maintenanceIntervalRounds: 5,
    rent: 12000,
    taxRate: 0.1,
  },
  {
    key: 'comercio-alimentos',
    name: 'Comercio de Alimentos',
    category: 'business',
    constructionCost: 20000,
    maintenanceCost: 2000,
    maintenanceIntervalRounds: 5,
    dividendsPerRound: 4000,
    taxRate: 0.15,
    options: ['Sorveteria', 'Restaurante Tradicional', 'Pizzaria', 'Hamburgueria', 'Sushi'],
  },
  {
    key: 'loja',
    name: 'Loja',
    category: 'business',
    constructionCost: 40000,
    maintenanceCost: 4000,
    maintenanceIntervalRounds: 5,
    dividendsPerRound: 8000,
    taxRate: 0.15,
    options: ['Pesca', 'Roupas', 'Calcados', 'Joias', 'Eletronica'],
  },
  {
    key: 'grande-empreendimento',
    name: 'Grande Empreendimento',
    category: 'business',
    constructionCost: 60000,
    maintenanceCost: 6000,
    maintenanceIntervalRounds: 5,
    dividendsPerRound: 12000,
    taxRate: 0.15,
    options: ['Mercado', 'Shopping', 'Aluguel de Carros', 'Cinema'],
  },
];

const neighborhoodByKey = Object.fromEntries(
  NEIGHBORHOODS.map((neighborhood) => [neighborhood.key, neighborhood]),
);

function street(
  index: number,
  neighborhoodKey: string,
  streetName: string,
  landValue?: number,
): BoardSpace {
  const neighborhood = neighborhoodByKey[neighborhoodKey];

  return {
    index,
    name: `${neighborhood.name} - ${streetName}`,
    kind: 'street',
    color: neighborhood.color,
    neighborhoodKey,
    streetName,
    landValue,
    propertySlots: 3,
  };
}

export const BOARD_SPACES: BoardSpace[] = [
  { index: 1, name: 'Inicio', kind: 'start', color: '#1f7a5f' },
  street(2, 'cidade-alta', 'Av. Rio Branco', 2000),
  street(3, 'cidade-alta', 'Rua Joao Pessoa', 2500),
  street(4, 'cidade-alta', 'Av. Deodoro da Fonseca', 3000),
  street(5, 'cidade-alta', 'Av. Camara Cascudo', 3500),
  { index: 6, name: 'Evento', kind: 'event', color: '#64748b' },
  street(7, 'lagoa-nova', 'Av. Amintas Barros', 6500),
  street(8, 'lagoa-nova', 'Av. Lima e Silva', 6000),
  street(9, 'lagoa-nova', 'Av. Senador Salgado Filho', 4500),
  street(10, 'lagoa-nova', 'Av. Prudente de Morais', 5000),
  street(11, 'lagoa-nova', 'Av. Bernardo Vieira', 5500),
  { index: 12, name: 'Embargo Fiscal', kind: 'fiscal-embargo', color: '#b91c1c' },
  street(13, 'alecrim', 'Av. Alexandrino de Alencar', 4500),
  street(14, 'alecrim', 'Av. Presidente Quaresma', 4000),
  street(15, 'alecrim', 'Av. Presidente Bandeira', 3000),
  { index: 16, name: 'Mercado de Vantagens', kind: 'advantage-market', color: '#7c3aed' },
  street(17, 'alecrim', 'Av. Coronel Estevam', 3500),
  { index: 18, name: 'Evento', kind: 'event', color: '#64748b' },
  street(19, 'tirol', 'Av. Hermes da Fonseca', 8500),
  street(20, 'tirol', 'Av. Campos Sales', 10500),
  { index: 21, name: 'Feriado', kind: 'holiday', color: '#0f766e' },
  street(22, 'tirol', 'Av. Afonso Pena', 9500),
  { index: 23, name: 'Banco', kind: 'bank', color: '#2563eb' },
  street(24, 'capim-macio', 'Av. Santos Dumont', 7000),
  street(25, 'capim-macio', 'Av. dos Geranios'),
  street(26, 'capim-macio', 'Rua Ismael Pereira da Silva', 6500),
  street(27, 'capim-macio', 'Av. das Alagoas', 6000),
  street(28, 'capim-macio', 'Av. Ayrton Senna', 5500),
  { index: 29, name: 'Evento Global', kind: 'global-event', color: '#ea580c' },
  street(30, 'candelaria', 'Av. Integracao', 8000),
  street(31, 'candelaria', 'Av. dos Xavantes', 8500),
  { index: 32, name: 'Bloqueio Bancario', kind: 'bank-block', color: '#991b1b' },
  street(33, 'candelaria', 'Av. Jaguarari', 7500),
  street(34, 'candelaria', 'Av. Prudente de Morais', 7000),
  street(35, 'ponta-negra', 'Av. Engenheiro Roberto Freire', 12000),
  street(36, 'ponta-negra', 'Rua Manoel Congo', 9000),
  street(37, 'ponta-negra', 'Rua Praia de Muriu', 10000),
  { index: 38, name: 'Receita Federal', kind: 'tax', color: '#334155' },
  street(39, 'ponta-negra', 'Rua Erivan Franca', 11000),
  street(40, 'ponta-negra', 'Rua da Floresta', 8000),
];

export const BOARD_SPACES_BY_INDEX = Object.fromEntries(
  BOARD_SPACES.map((space) => [space.index, space]),
) as Record<number, BoardSpace>;

export const EVENT_CARDS = [
  { key: 'event-1', message: 'Evento de sorte inicial.', tone: 'luck', amount: 1000 },
  { key: 'event-2', message: 'Evento de reves inicial.', tone: 'setback', amount: 1000 },
  { key: 'event-3', message: 'Evento de sorte inicial.', tone: 'luck', amount: 1500 },
] as const;

export const GLOBAL_EVENT_CARDS = [
  { key: 'global-event-1', message: 'Evento global de sorte inicial.', tone: 'luck', amount: 1000 },
  {
    key: 'global-event-2',
    message: 'Evento global de reves inicial.',
    tone: 'setback',
    amount: 1000,
  },
  { key: 'global-event-3', message: 'Evento global de sorte inicial.', tone: 'luck', amount: 1500 },
] as const;
