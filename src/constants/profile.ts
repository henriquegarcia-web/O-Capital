export const PROFILE_PHOTOS = [
  {
    key: 'perfil_1',
    label: 'Perfil 1',
    path: '/profiles/perfil_1.png',
  },
  {
    key: 'perfil_2',
    label: 'Perfil 2',
    path: '/profiles/perfil_2.png',
  },
  {
    key: 'perfil_3',
    label: 'Perfil 3',
    path: '/profiles/perfil_3.png',
  },
  {
    key: 'perfil_4',
    label: 'Perfil 4',
    path: '/profiles/perfil_4.png',
  },
  {
    key: 'perfil_5',
    label: 'Perfil 5',
    path: '/profiles/perfil_5.png',
  },
  {
    key: 'perfil_6',
    label: 'Perfil 6',
    path: '/profiles/perfil_6.png',
  },
] as const;

export const PROFILE_COLORS = [
  {
    key: 'verde',
    label: 'Verde',
    value: '#1f7a5f',
  },
  {
    key: 'azul',
    label: 'Azul',
    value: '#2563eb',
  },
  {
    key: 'vermelho',
    label: 'Vermelho',
    value: '#dc2626',
  },
  {
    key: 'amarelo',
    label: 'Amarelo',
    value: '#ca8a04',
  },
  {
    key: 'roxo',
    label: 'Roxo',
    value: '#7c3aed',
  },
  {
    key: 'ciano',
    label: 'Ciano',
    value: '#0891b2',
  },
] as const;

export type ProfilePhotoKey = (typeof PROFILE_PHOTOS)[number]['key'];
export type ProfileColorKey = (typeof PROFILE_COLORS)[number]['key'];
