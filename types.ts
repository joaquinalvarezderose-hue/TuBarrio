
export interface User {
  name: string;
  address: string;
  avatar: string;
  verified: boolean;
}

export interface Activity {
  id: string;
  user: string;
  title: string;
  description: string;
  time: string;
  avatar: string;
}

export interface IncidentReport {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'resolved';
  date: string;
}
