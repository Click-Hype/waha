// Modified by NooviCrew: optional build-time engine profile; no runtime widening.
import { WAHAEngine } from '@waha/structures/enums.dto';

// Legacy multi-engine artifact retains its existing behavior.
export const SUPPORTED_ENGINES: readonly WAHAEngine[] = Object.freeze([
  WAHAEngine.WEBJS,
  WAHAEngine.WPP,
  WAHAEngine.NOWEB,
  WAHAEngine.GOWS,
]);
export const DEFAULT_ENGINE = WAHAEngine.WEBJS;
export const RESTRICTED_ENGINE_PROFILE = false;

export function requireEngineAvailable(engine: string): void {
  if (
    RESTRICTED_ENGINE_PROFILE &&
    !SUPPORTED_ENGINES.some((supported) => supported === engine)
  ) {
    throw new Error('Requested engine is not included in this artifact.');
  }
}
