import { hdosStore } from './store';
import { hdosEvents } from './events';
import { hdosSync } from './sync';
import { hdosAuth } from './auth';
import { hdosAI } from './ai';

// Global namespace definition
declare global {
  interface Window {
    HDOS: {
      store: typeof hdosStore;
      events: typeof hdosEvents;
      sync: typeof hdosSync;
      auth: typeof hdosAuth;
      ai: typeof hdosAI;
      version: string;
      initialized: boolean;
    };
  }
}

export async function bootHDOS(): Promise<void> {
  console.log('%c[CGG HDOS Enterprise] Booting Master Blueprint v3.0 Core Layer...', 'color: #00E676; font-size: 14px; font-weight: bold;');

  // Initialize subsystems
  await hdosStore.init();
  await hdosSync.init();

  // Mount to global namespace according to Core Constitution Locked Rule
  if (typeof window !== 'undefined') {
    window.HDOS = {
      store: hdosStore,
      events: hdosEvents,
      sync: hdosSync,
      auth: hdosAuth,
      ai: hdosAI,
      version: '3.0.0-Enterprise-Build-28',
      initialized: true,
    };
  }

  hdosEvents.emit('system:boot_completed', { version: '3.0.0' });
  console.log('%c[CGG HDOS Enterprise] Global namespace window.HDOS bound successfully.', 'color: #42A5F5; font-weight: bold;');
}
