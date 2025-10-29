// URL mapping interface
export interface UrlMapping {
  originalUrl: string;
  shortId: string;
  createdAt: string;
}

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    isAuthenticated?: boolean;
    username?: string;
  }
}