import { Role } from './role.model';

export interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  roles: Role[];
  profileComplete: boolean;
  telefono?: string;
  especialidad?: string;
  matricula?: string;
  estudio?: string;
  provincia?: string;
  ciudad?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
