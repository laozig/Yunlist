import path from 'path';
import { config } from '../config';

/**
 * Resolve a caller-supplied relative path to an absolute path inside FILES_ROOT.
 * Throws if the resolved path escapes the root (path traversal guard).
 */
export function safeResolve(relPath: string): string {
  // Normalise and strip any leading slash so path.join works predictably
  const normalised = path.normalize(relPath).replace(/^(\.\.([\/\\]|$))+/, '');
  const resolved = path.resolve(config.filesRoot, normalised);

  if (!resolved.startsWith(path.resolve(config.filesRoot) + path.sep) &&
      resolved !== path.resolve(config.filesRoot)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

/** Return the normalised relative path (forward slashes, no leading slash). */
export function toRelPath(absPath: string): string {
  return path.relative(config.filesRoot, absPath).replace(/\\/g, '/');
}
