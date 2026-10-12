import { apiClient } from './api-client';

export type MemberType = 'STUDENT' | 'STAFF' | 'OTHER';

export interface AttendanceMember {
  identifier: string;
  member_type: MemberType;
  first_name: string;
  last_name: string;
  second_last_name?: string;
  email?: string;
  phone?: string;
  photo?: string | null;
  extra_attributes?: Record<string, any>;
  is_active: boolean;
}

export interface AttendanceRelation {
  id: number;
  member: string;
  table: string;
  row: string;
  member_detail?: AttendanceMember;
  table_name?: string;
  row_name?: string;
}

export interface CheckAttendancePayload {
  id: string;
}

export interface CheckAttendanceResponse {
  message: string;
  identifier: string;
  date: string;
}

export interface UploadMemberPayload {
  identifier: string;
  member_type: MemberType;
  first_name: string;
  last_name: string;
  second_last_name?: string;
  email?: string;
  phone?: string;
  photo?: string | null;
  group: string;
  extra_attributes?: Record<string, any>;
}

export interface UploadMemberResponse {
  message: string;
  identifier: string;
  table_id: string;
  row_id: string;
  relation_id: number;
  created: boolean;
}

export interface GetMembersParams {
  type?: MemberType | string;
  member_type?: MemberType | string;
  search?: string;
  is_active?: boolean;
}

export interface GetRelationsParams {
  member?: string;
  table?: string;
}

// Standalone functions returning AxiosResponse
export const getAttendanceMembers = (params?: GetMembersParams) =>
  apiClient.get<AttendanceMember[]>('/asistencia/members/', { params });

export const getAttendanceMemberById = (identifier: string) =>
  apiClient.get<AttendanceMember>(`/asistencia/members/${identifier}/`);

export const createAttendanceMember = (data: Partial<AttendanceMember>) =>
  apiClient.post<AttendanceMember>('/asistencia/members/', data);

export const updateAttendanceMember = (identifier: string, data: Partial<AttendanceMember>) =>
  apiClient.patch<AttendanceMember>(`/asistencia/members/${identifier}/`, data);

export const deleteAttendanceMember = (identifier: string) =>
  apiClient.delete(`/asistencia/members/${identifier}/`);

export const uploadAttendanceMember = (data: UploadMemberPayload) =>
  apiClient.post<UploadMemberResponse>('/asistencia/upload/', data);

export const checkAttendanceApi = (payload: CheckAttendancePayload) =>
  apiClient.post<CheckAttendanceResponse>('/asistencia/check/', payload);

export const getAttendanceRelations = (params?: GetRelationsParams) =>
  apiClient.get<AttendanceRelation[]>('/asistencia/relations/', { params });

export const createAttendanceRelation = (data: { member: string; table: string; row: string }) =>
  apiClient.post<AttendanceRelation>('/asistencia/relations/', data);

export const deleteAttendanceRelation = (id: number) =>
  apiClient.delete(`/asistencia/relations/${id}/`);

// Unified service returning unpacked data
export const asistenciaService = {
  getMembers: (params?: GetMembersParams) =>
    getAttendanceMembers(params).then(res => res.data),

  getMemberById: (identifier: string) =>
    getAttendanceMemberById(identifier).then(res => res.data),

  createMember: (data: Partial<AttendanceMember>) =>
    createAttendanceMember(data).then(res => res.data),

  updateMember: (identifier: string, data: Partial<AttendanceMember>) =>
    updateAttendanceMember(identifier, data).then(res => res.data),

  deleteMember: (identifier: string) =>
    deleteAttendanceMember(identifier).then(res => res.data),

  uploadMember: (data: UploadMemberPayload) =>
    uploadAttendanceMember(data).then(res => res.data),

  checkAttendance: (payload: CheckAttendancePayload) =>
    checkAttendanceApi(payload).then(res => res.data),

  getRelations: (params?: GetRelationsParams) =>
    getAttendanceRelations(params).then(res => res.data),

  createRelation: (data: { member: string; table: string; row: string }) =>
    createAttendanceRelation(data).then(res => res.data),

  deleteRelation: (id: number) =>
    deleteAttendanceRelation(id).then(res => res.data),
};
