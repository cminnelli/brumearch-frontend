import { Routes } from '@angular/router';
import { authGuard, clientGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent
      ),
  },
  {
    path: 'profile-setup',
    loadComponent: () =>
      import('./features/auth/profile-setup/profile-setup.component').then(
        (m) => m.ProfileSetupComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/projects.component').then((m) => m.ProjectsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projects/:id',
    loadComponent: () =>
      import('./features/projects/project-detail/project-detail.component').then(
        (m) => m.ProjectDetailComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'config',
    loadComponent: () =>
      import('./features/config/config.component').then((m) => m.ConfigComponent),
    canActivate: [authGuard],
  },
  {
    path: 'entorno',
    loadComponent: () =>
      import('./features/entorno/entorno.component').then((m) => m.EntornoComponent),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client',
    loadComponent: () =>
      import('./features/client/client-dashboard/client-dashboard.component').then(
        (m) => m.ClientDashboardComponent
      ),
    canActivate: [clientGuard],
  },
  {
    path: 'client/projects/:id',
    loadComponent: () =>
      import('./features/client/client-project/client-project.component').then(
        (m) => m.ClientProjectComponent
      ),
    canActivate: [clientGuard],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
