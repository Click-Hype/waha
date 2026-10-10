// Modified by NooviCrew: NOWEB-only build profile, fixed in compiled source.
import { WAHAEngine } from '@waha/structures/enums.dto';

export const SUPPORTED_ENGINES: readonly WAHAEngine[] = Object.freeze([
  WAHAEngine.NOWEB,
]);
export const DEFAULT_ENGINE = WAHAEngine.NOWEB;
export const RESTRICTED_ENGINE_PROFILE = true;

export function requireEngineAvailable(engine: string): void {
  if (!SUPPORTED_ENGINES.some((supported) => supported === engine)) {
    throw new Error('Requested engine is not included in this artifact.');
  }
}
