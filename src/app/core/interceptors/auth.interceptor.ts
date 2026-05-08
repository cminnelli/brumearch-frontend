import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '../../firebase.config';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'auth_token';
let refreshing = false;

async function refreshJwt(): Promise<string | null> {
  const fbUser = getAuth(firebaseApp).currentUser;
  if (!fbUser) return null;
  try {
    const idToken = await fbUser.getIdToken(true);
    const res = await fetch(`${environment.apiUrl}/auth/firebase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem(TOKEN_KEY);

  const withToken = (t: string) =>
    req.clone({ setHeaders: { Authorization: `Bearer ${t}` } });

  const authReq = token ? withToken(token) : req;

  return next(authReq).pipe(
    catchError((err) => {
      const is401 = err instanceof HttpErrorResponse && err.status === 401;
      const isAuthRoute = req.url.includes('/auth/');

      if (is401 && token && !isAuthRoute && !refreshing) {
        refreshing = true;
        return from(refreshJwt()).pipe(
          switchMap((newToken) => {
            refreshing = false;
            if (!newToken) {
              localStorage.removeItem(TOKEN_KEY);
              router.navigate(['/login']);
              return throwError(() => err);
            }
            localStorage.setItem(TOKEN_KEY, newToken);
            return next(withToken(newToken));
          }),
          catchError(() => {
            refreshing = false;
            localStorage.removeItem(TOKEN_KEY);
            router.navigate(['/login']);
            return throwError(() => err);
          }),
        );
      }

      if (is401 && !isAuthRoute) {
        localStorage.removeItem(TOKEN_KEY);
        router.navigate(['/login']);
      }

      return throwError(() => err);
    }),
  );
};
