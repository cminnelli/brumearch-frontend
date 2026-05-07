import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const check = () => {
    if (!auth.isAuthenticated || !auth.currentUser()) {
      return router.createUrlTree(['/login']);
    }
    const user = auth.currentUser()!;
    const targetPath = state.url.split('?')[0];
    const isOnProfileSetup = targetPath === '/profile-setup';

    if (!user.profileComplete && !isOnProfileSetup) {
      return router.createUrlTree(['/profile-setup']);
    }
    if (user.profileComplete && isOnProfileSetup) {
      return router.createUrlTree(['/dashboard']);
    }
    return true;
  };

  if (auth.sessionRestored()) return check();

  return toObservable(auth.sessionRestored).pipe(
    filter((done) => done),
    take(1),
    map(() => check())
  );
};
