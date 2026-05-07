import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-setup.component.html',
  styleUrl: './profile-setup.component.scss',
})
export class ProfileSetupComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  name = '';
  telefono = '';

  loading = signal(false);
  error = signal('');

  ngOnInit() {
    const user = this.auth.currentUser();
    if (user) this.name = user.name;
  }

  submit() {
    if (!this.name.trim()) {
      this.error.set('El nombre es requerido');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.auth
      .completeProfile({ name: this.name, telefono: this.telefono })
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.error.set(err?.error?.message || 'Error al guardar el perfil');
          this.loading.set(false);
        },
      });
  }
}
