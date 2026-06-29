import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'chat', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./auth/auth').then(m => m.AuthComponent) },
  { path: 'chat', loadComponent: () => import('./chat/chat').then(m => m.ChatComponent), canActivate: [authGuard] },
];
