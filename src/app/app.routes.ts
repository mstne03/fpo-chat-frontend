import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'lobby', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./auth/auth').then((m) => m.AuthComponent) },
  {
    path: 'lobby',
    loadComponent: () => import('./lobby/lobby').then((m) => m.LobbyComponent),
    canActivate: [authGuard],
  },
];
