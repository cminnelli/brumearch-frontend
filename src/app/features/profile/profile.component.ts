import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);

  name = '';
  telefono = '';

  saving = signal(false);
  uploading = signal(false);
  saved = signal(false);
  error = signal('');

  ngOnInit() {
    const user = this.auth.currentUser();
    if (user) {
      this.name = user.name;
      this.telefono = user.telefono ?? '';
    }
  }

  get avatarUrl(): string | null {
    return this.auth.currentUser()?.avatar ?? null;
  }

  get initials(): string {
    return (this.auth.currentUser()?.name ?? '?')
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  onAvatarFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.error.set('');
    this.auth.uploadAvatar(file).subscribe({
      next: () => this.uploading.set(false),
      error: () => {
        this.error.set('Error al subir la imagen');
        this.uploading.set(false);
      },
    });
  }

  save() {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    this.auth.completeProfile({ name: this.name, telefono: this.telefono }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2000);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }
}
