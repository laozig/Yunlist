import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import type { FastifyReply } from 'fastify';

type ArchiveDescriptor = {
  archivePath: string;
  downloadName: string;
  contentType: string;
};

function sanitizeArchiveName(name: string): string {
  return (name || 'archive').replace(/[\\/:*?"<>|]/g, '_');
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Archive command exited with code ${code}`));
    });
  });
}

async function createArchiveDescriptor(targetPath: string): Promise<ArchiveDescriptor> {
  const baseName = sanitizeArchiveName(path.basename(targetPath) || 'archive');

  if (process.platform === 'win32') {
    const archivePath = path.join(os.tmpdir(), `yunlist-${randomUUID()}.zip`);
    const escapedTarget = targetPath.replace(/'/g, "''");
    const escapedArchive = archivePath.replace(/'/g, "''");
    const script = `Compress-Archive -LiteralPath '${escapedTarget}' -DestinationPath '${escapedArchive}' -Force`;

    await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);

    return {
      archivePath,
      downloadName: `${baseName}.zip`,
      contentType: 'application/zip',
    };
  }

  const archivePath = path.join(os.tmpdir(), `yunlist-${randomUUID()}.tar.gz`);
  await runProcess('tar', ['-czf', archivePath, '-C', path.dirname(targetPath), path.basename(targetPath)]);

  return {
    archivePath,
    downloadName: `${baseName}.tar.gz`,
    contentType: 'application/gzip',
  };
}

export async function sendArchiveReply(reply: FastifyReply, targetPath: string) {
  const { archivePath, downloadName, contentType } = await createArchiveDescriptor(targetPath);

  const cleanup = async () => {
    try {
      await fs.promises.unlink(archivePath);
    } catch {
      // ignore cleanup failures
    }
  };

  const archiveStream = fs.createReadStream(archivePath);
  const finalize = () => { void cleanup(); };

  archiveStream.on('close', finalize);
  archiveStream.on('error', finalize);
  reply.raw.on('close', finalize);

  reply.header('Content-Type', contentType);
  reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  return reply.send(archiveStream);
}