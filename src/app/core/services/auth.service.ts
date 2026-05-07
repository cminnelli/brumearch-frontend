import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { from, EMPTY, Observable } from 'rxjs';
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
} from 'firebase/auth';
import { firebaseApp } from '../../firebase.config';

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

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  get isAdmin(): boolean {
    return this.hasRole('admin');
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
        tap((res) => {
          this.currentUser.set(res.user);
          this.sessionRestored.set(true);
        }),
        catchError(() => {
          this.clearToken();
          this.sessionRestored.set(true);
          return EMPTY;
        })
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
    if (!res.user.profileComplete) {
      this.router.navigate(['/profile-setup']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  private clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    this.currentUser.set(null);
  }
}
