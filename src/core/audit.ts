import { hseApi } from './api';

export class AuditLog {
  static log(action: string, entity: string, entityId: string, details?: unknown): void {
    const timestamp = new Date().toISOString();
    const log = {
      action,
      entity,
      entityId,
      timestamp,
      details,
      userEmail: this.getCurrentUserEmail(),
    };
    console.log(`[HDOS audit] ${action} on ${entity}:${entityId}`, log);
    try {
      const existing = sessionStorage.getItem('hdos_audit_log') || '[]';
      const logs = JSON.parse(existing);
      logs.push(log);
      if (logs.length > 100) logs.shift();
      sessionStorage.setItem('hdos_audit_log', JSON.stringify(logs));
    } catch (error) {
      console.error('[HDOS audit] failed to store log', error);
    }
  }

  private static getCurrentUserEmail(): string {
    try {
      const user = sessionStorage.getItem('hdos_current_user');
      return user ? JSON.parse(user).email : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  static getLogs(): unknown[] {
    try {
      const stored = sessionStorage.getItem('hdos_audit_log') || '[]';
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  static clear(): void {
    sessionStorage.removeItem('hdos_audit_log');
  }
}
