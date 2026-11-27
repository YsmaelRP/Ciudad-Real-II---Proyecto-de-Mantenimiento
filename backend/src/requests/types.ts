import type { SessionUser } from '../auth/types.js';

export type RequestStatus = 'Pendiente' | 'En proceso' | 'Resuelta';
export type HistoryType = 'created' | 'assignment' | 'status';

export type HistoryEntry = {
  id: string;
  previousStatus: RequestStatus | null;
  newStatus: RequestStatus;
  userId: string;
  userName: string;
  at: string;
  note: string;
  type: HistoryType;
};

export type RequestRecord = {
  id: string;
  code: string;
  residentId: string;
  residentName: string;
  category: string;
  location: string;
  description: string;
  status: RequestStatus;
  createdAt: string;
  assignedTo: string | null;
  assignedName: string | null;
  resolution: string | null;
  history: HistoryEntry[];
};

export type RequestFilters = {
  search?: string;
  status?: RequestStatus;
};

export type NewRequestInput = {
  residentId: number;
  categoryId: number;
  location: string;
  description: string;
};

export interface RequestRepository {
  createRequest(input: NewRequestInput): Promise<RequestRecord>;
  listRequests(user: SessionUser, filters: RequestFilters): Promise<RequestRecord[]>;
  findRequest(user: SessionUser, id: number): Promise<RequestRecord | undefined>;
  assignRequest(requestId: number, technicianId: number, administratorId: number): Promise<RequestRecord | undefined>;
  changeStatus(requestId: number, user: SessionUser, next: RequestStatus, description?: string): Promise<RequestRecord | undefined>;
}
