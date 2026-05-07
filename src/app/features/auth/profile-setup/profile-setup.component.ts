import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

const PROVINCIAS = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
];

const ESPECIALIDADES = [
  'Arquitectura',
  'Diseño de Interiores',
  'Urbanismo y Planeamiento',
  'Construcción',
  'Diseño Sustentable',
  'Paisajismo',
  'Otro',
];

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

  readonly provincias = PROVINCIAS;
  readonly especialidades = ESPECIALIDADES;

  name = '';
  telefono = '';
  especialidad = '';
  matricula = '';
  estudio = '';
  provincia = '';
  ciudad = '';

  loading = signal(false);
  error = signal('');

  ngOnInit() {
    const user = this.auth.currentUser();
    if (user) this.name = user.name;
  }

  submit() {
    if (!this.especialidad) {
      this.error.set('Seleccioná una especialidad');
      return;
    }
    this.error.set('');
    this.loading.set(true);

    this.auth
      .completeProfile({
        name: this.name,
        telefono: this.telefono,
        especialidad: this.especialidad,
        matricula: this.matricula,
        estudio: this.estudio,
        provincia: this.provincia,
        ciudad: this.ciudad,
      })
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.error.set(err?.error?.message || 'Error al guardar el perfil');
          this.loading.set(false);
        },
      });
  }
}
