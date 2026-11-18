import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { from, of, EMPTY, Observable, Observer } from 'rxjs';
import { tap, catchError, switchMap, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { User, AuthResponse } from '../../shared/models/user.model';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { firebaseApp } from '../../firebase.config';
import { FILE_TOKEN_KEY } from '../../shared/utils/file-url';

const TOKEN_KEY = 'auth_token';
const fbAuth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private baseUrl = `${environment.apiUrl}/auth`;

  currentUser = signal<User | null>(null);
  sessionRestored = signal(false);

  constructor() {
    // El token de archivos dura 12 h: se renueva cada hora mientras haya sesión
    setInterval(() => { if (this.token) this.loadFileToken().subscribe(); }, 60 * 60 * 1000);
  }

  /** Pide el token corto con el que se abren los archivos subidos. */
  loadFileToken(): Observable<void> {
    return this.http.get<{ token: string }>(`${this.baseUrl}/file-token`).pipe(
      tap((r) => { try { localStorage.setItem(FILE_TOKEN_KEY, r.token); } catch { /* sin storage */ } }),
      map(() => void 0),
      catchError(() => of(void 0)),
    );
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  get isAdmin(): boolean {
    return this.hasRole('admin');
  }

  get isClient(): boolean {
    return this.hasRole('client') && !this.isAdmin;
  }

  login(email: string, password: string): Observable<void> {
    return from(signInWithEmailAndPassword(fbAuth, email, password)).pipe(
      switchMap((cred) => from(cred.user.getIdToken())),
      switchMap((idToken) => this.exchangeToken(idToken))
    );
  }

  register(email: string, password: string): Observable<void> {
    return from(createUserWithEmailAndPassword(fbAuth, email, password)).pipe(
      switchMap((cred) => from(cred.user.getIdToken())),
      switchMap((idToken) => this.exchangeToken(idToken))
    );
  }

  loginWithGoogle(): Observable<void> {
    return from(signInWithPopup(fbAuth, googleProvider)).pipe(
      switchMap((cred) => from(cred.user.getIdToken())),
      switchMap((idToken) => this.exchangeToken(idToken))
    );
  }

  private exchangeToken(idToken: string): Observable<void> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/firebase`, { idToken }).pipe(
      tap((res) => this.handleAuth(res)),
      map(() => void 0)
    );
  }

  restoreSession() {
    if (!this.token) {
      this.sessionRestored.set(true);
      return;
    }
    this.http
      .get<{ user: User }>(`${this.baseUrl}/me`)
      .pipe(
        switchMap((res) => this.loadFileToken().pipe(map(() => res))),
        tap((res) => {
          this.currentUser.set(res.user);
          this.sessionRestored.set(true);
        }),
        catchError(() =>
          new Observable<void>((observer: Observer<void>) => {
            const unsub = onAuthStateChanged(fbAuth, (fbUser) => {
              unsub();
              if (!fbUser) {
                this.clearToken();
                this.sessionRestored.set(true);
                observer.complete();
                return;
              }
              from(fbUser.getIdToken(true))
                .pipe(
                  switchMap((idToken) =>
                    this.http.post<AuthResponse>(`${this.baseUrl}/firebase`, { idToken }).pipe(
                      tap((res) => {
                        localStorage.setItem('auth_token', res.token);
                        this.currentUser.set(res.user);
                        this.sessionRestored.set(true);
                      }),
                      switchMap(() => this.loadFileToken())
                    )
                  ),
                  catchError(() => {
                    this.clearToken();
                    this.sessionRestored.set(true);
                    return EMPTY;
                  })
                )
                .subscribe({ next: () => observer.next(), error: () => observer.complete(), complete: () => observer.complete() });
            });
          })
        )
      )
      .subscribe();
  }

  fetchMe(): Observable<{ user: User }> {
    return this.http
      .get<{ user: User }>(`${this.baseUrl}/me`)
      .pipe(tap((res) => this.currentUser.set(res.user)));
  }

  completeProfile(data: Partial<User>): Observable<{ user: User }> {
    return this.http.put<{ user: User }>(`${this.baseUrl}/profile`, data).pipe(
      tap((res) => this.currentUser.set(res.user))
    );
  }

  uploadAvatar(file: File): Observable<{ user: User }> {
    const form = new FormData();
    form.append('avatar', file);
    return this.http.post<{ user: User }>(`${this.baseUrl}/avatar`, form).pipe(
      tap((res) => this.currentUser.set(res.user))
    );
  }

  logout(): void {
    signOut(fbAuth).catch(() => {});
    this.clearToken();
    this.router.navigate(['/login']);
  }

  hasRole(roleName: string): boolean {
    return (this.currentUser()?.roles ?? []).some((r) => r.name === roleName);
  }

  private handleAuth(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.token);
    this.currentUser.set(res.user);
    this.sessionRestored.set(true);
    this.loadFileToken().subscribe();
    if (!res.user.profileComplete) {
      this.router.navigate(['/profile-setup']);
    } else if (this.isClient) {
      this.router.navigate(['/client']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  private clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    try { localStorage.removeItem(FILE_TOKEN_KEY); } catch { /* sin storage */ }
    this.currentUser.set(null);
  }
}
