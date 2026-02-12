export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface AudioVisualizerState {
  volume: number;
}

export interface LogEntry {
  source: 'user' | 'ducky' | 'system';
  message: string;
  timestamp: Date;
  citations?: { title: string; uri: string }[];
}

export interface ActiveTimer {
  id: string;
  duration: number;
  remaining: number;
}