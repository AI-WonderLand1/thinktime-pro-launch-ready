export interface User {
  id: string;
  email: string;
  contactEmail?: string;
  role: 'admin' | 'manager' | 'employee';
  name: string;
  employeeId: string;
  payRate?: number;
  managerId?: string; // ID of the manager they report to
}

export interface CompanySettings {
  companyName: string;
  llcNumber: string;
  emailTemplate?: 'standard' | 'detailed' | 'friendly';
}

export interface Timesheet {
  id: string;
  userId: string;
  clockIn: number; // timestamp
  clockOut: number | null; // timestamp
  status: 'pending' | 'approved' | 'rejected';
  totalHours: number; // updated on clockOut
  location?: { lat: number; lng: number }; // For Geolocation
}

export interface OTRequest {
  id: string;
  userId: string;
  employeeName: string;
  employeeId: string;
  managerId: string;
  requestedDates: string;
  requestedShift: string;
  status: 'pending' | 'approved' | 'denied';
  denyReason?: string;
  timestamp: number;
}

export interface PTORequest {
  id: string;
  userId: string;
  employeeName: string;
  employeeId: string;
  managerId: string;
  type: 'Vacation' | 'Sick Leave' | 'Personal';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'pending' | 'approved' | 'denied';
  denyReason?: string;
  timestamp: number;
}

export interface Reminder {
  id: string;
  userId: string;
  time: number;
  message: string;
}
