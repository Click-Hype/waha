import { DEFAULT_ENGINE, requireEngineAvailable } from '@waha/core/runtime-engine-profile';

export function getEngineName(): string {
  const engine = process.env.WHATSAPP_DEFAULT_ENGINE || DEFAULT_ENGINE;
  requireEngineAvailable(engine);
  return engine;
}

export function getNamespace(): string {
  //   Controls the prefix used for the main database and folder (non-session data)
  //   If not set - falls back to engine name for backward compatibility
  return (process.env.WAHA_NAMESPACE || getEngineName()).toLowerCase();
}

export function getSessionNamespace(): string {
  //   Controls the prefix used for session databases and folders
  //   If not set - falls back to engine name for backward compatibility
  return (process.env.WAHA_SESSION_NAMESPACE || getEngineName()).toLowerCase();
}
