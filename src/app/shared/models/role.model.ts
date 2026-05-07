export interface Role {
  _id: string;
  name: string;
  label: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
