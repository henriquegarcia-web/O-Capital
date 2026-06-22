import { createBrowserRouter } from 'react-router-dom';

import { AppLayout } from '@/components/ui';
import { GameBoardPage, GamePlayersPage, HomePage, RoomPage } from '@/pages';

import { ROUTES } from './routes';

export const router = createBrowserRouter([
  {
    path: ROUTES.home,
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: ROUTES.room,
        element: <RoomPage />,
      },
      {
        path: ROUTES.gamePlayers,
        element: <GamePlayersPage />,
      },
      {
        path: ROUTES.gameBoard,
        element: <GameBoardPage />,
      },
    ],
  },
]);
