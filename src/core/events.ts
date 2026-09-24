/**
 * HDOS Event Bus Constitution (Section 24)
 * Every module emits and listens to events via this bus.
 */

type EventHandler<T = any> = (payload: T) => void;

class HDOSEventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  on<T = any>(eventName: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(handler);

    // Return unbind function
    return () => {
      this.off(eventName, handler);
    };
  }

  off<T = any>(eventName: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  emit<T = any>(eventName: string, payload?: T): void {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[HDOS Events] Error in handler for "${eventName}":`, err);
        }
      });
    }

    // System log of critical events
    if (typeof window !== 'undefined' && eventName.includes(':')) {
      console.log(`%c[HDOS Event] ${eventName}`, 'color: #00E676; font-weight: bold;', payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const hdosEvents = new HDOSEventBus();
