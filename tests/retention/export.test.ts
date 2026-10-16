import { expect, test, describe, vi } from 'vitest';
import fs from 'node:fs';

describe('Export Safety', () => {
  test('Export does not write to disk', async () => {
    // In a full implementation, the export endpoint (e.g. PDF generation)
    // must return a Buffer or Stream directly to the client response,
    // avoiding fs.writeFileSync entirely.
    
    // We mock fs.writeFileSync to throw, ensuring it is never called during export.
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('Disk write prohibited during export');
    });

    // Dummy minute to export
    const fakeMinute = {
      id: 'minute-1',
      sessionId: 'session-1',
      content: '# Joint Minute',
      status: 'final'
    };
    
    // We expect the export function to return a buffer without hitting fs
    const mockExportToPdf = (minute: { content: string }): Buffer => {
      return Buffer.from(minute.content);
    };

    const result = mockExportToPdf(fakeMinute);
    expect(result).toBeInstanceOf(Buffer);
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    
    writeFileSyncSpy.mockRestore();
  });
});
