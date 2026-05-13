import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getConfig, initDataDir } from './config.js';
import { v4 as uuid } from 'uuid';

export interface Session {
  id: string;
  createdAt: number;
  lastActivity: number;
  profileDir: string;
  cookies: Map<string, any[]>;
}

const sessions = new Map<string, Session>();

export function createSession(name?: string): Session {
  const baseDir = initDataDir();
  const id = name || uuid().slice(0, 8);
  const profileDir = join(baseDir, 'profiles', id);

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const session: Session = {
    id,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    profileDir,
    cookies: new Map(),
  };

  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getDefaultSession(): Session {
  let session = sessions.get('default');
  if (!session) {
    session = createSession('default');
  }
  return session;
}

export function destroySession(id: string): void {
  sessions.delete(id);
}

export function listSessions(): Session[] {
  return Array.from(sessions.values());
}

export function updateActivity(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.lastActivity = Date.now();
  }
}
