import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);

  email = '';
  password = '';
  mode: 'login' | 'register' = 'login';
  loading = signal(false);
  error = signal('');

  setMode(m: 'login' | 'register') {
    this.mode = m;
    this.error.set('');
  }

  loginWithGoogle() {
    this.error.set('');
    this.loading.set(true);
    this.auth.loginWithGoogle().subscribe({
      error: (err) => {
        this.error.set(this.parseError(err));
        this.loading.set(false);
      },
    });
  }

  submit() {
    this.error.set('');
    this.loading.set(true);
    const action =
      this.mode === 'login'
        ? this.auth.login(this.email, this.password)
        : this.auth.register(this.email, this.password);

    action.subscribe({
      error: (err) => {
        this.error.set(this.parseError(err));
        this.loading.set(false);
      },
    });
  }

  private parseError(err: any): string {
    // Firebase error codes
    const code = err?.code as string | undefined;
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Email o contraseña incorrectos';
    }
    if (code === 'auth/email-already-in-use') return 'El email ya está registrado';
    if (code === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres';
    if (code === 'auth/invalid-email') return 'Email inválido';
    if (code === 'auth/popup-closed-by-user') return 'Se cerró la ventana de Google';
    return err?.error?.message || err?.message || 'Error al ingresar';
  }
}
