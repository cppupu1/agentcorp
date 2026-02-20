import { randomBytes } from 'crypto';

export function generateId(): string {
  return randomBytes(8).toString('hex');
}

export function now(): string {
  return new Date().toISOString();
}
