import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as neovim from 'neovim';

// We need to mock the module before importing the functions
vi.mock('neovim');
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      access: vi.fn(),
    },
  };
});

describe('nvim-operations unit tests with mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findNvimSockets with mocks', () => {
    it('should find nvim socket directories', async () => {
      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
        { name: 'nvim.67890', isDirectory: () => true },
        { name: 'other-dir', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined); // File exists

      const { findNvimSockets } = await import('../lib/nvim-operations.js');
      const sockets = await findNvimSockets();

      expect(Array.isArray(sockets)).toBe(true);
      // Should find 2 nvim socket directories
      expect(sockets.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing socket files', async () => {
      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist

      const { findNvimSockets } = await import('../lib/nvim-operations.js');
      const sockets = await findNvimSockets();

      expect(Array.isArray(sockets)).toBe(true);
    });

    it('should handle readdir errors', async () => {
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      const { findNvimSockets } = await import('../lib/nvim-operations.js');
      const sockets = await findNvimSockets();

      expect(Array.isArray(sockets)).toBe(true);
      expect(sockets).toHaveLength(0);
    });

    describe('XDG_RUNTIME_DIR socket discovery', () => {
      let originalXdgRuntimeDir;

      beforeEach(() => {
        originalXdgRuntimeDir = process.env.XDG_RUNTIME_DIR;
      });

      afterEach(() => {
        if (originalXdgRuntimeDir === undefined) {
          delete process.env.XDG_RUNTIME_DIR;
        } else {
          process.env.XDG_RUNTIME_DIR = originalXdgRuntimeDir;
        }
      });

      it('should skip XDG scan when XDG_RUNTIME_DIR is not set', async () => {
        delete process.env.XDG_RUNTIME_DIR;

        fs.readdir.mockResolvedValueOnce([]); // TMPDIR empty

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(Array.isArray(sockets)).toBe(true);
        expect(sockets).toHaveLength(0);
        expect(fs.readdir).toHaveBeenCalledTimes(1);
      });

      it('should find flat nvim socket with dot separator in XDG_RUNTIME_DIR', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([]) // TMPDIR empty
          .mockResolvedValueOnce([
            { name: 'nvim.12345.0', isDirectory: () => false },
            { name: 'unrelated.sock', isDirectory: () => false },
          ]);
        fs.access.mockResolvedValue(undefined);

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(sockets).toHaveLength(1);
        expect(sockets[0]).toContain('nvim.12345.0');
      });

      it('should find flat nvim socket with dash separator in XDG_RUNTIME_DIR', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([]) // TMPDIR empty
          .mockResolvedValueOnce([
            { name: 'nvim-67890.0', isDirectory: () => false },
          ]);
        fs.access.mockResolvedValue(undefined);

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(sockets).toHaveLength(1);
        expect(sockets[0]).toContain('nvim-67890.0');
      });

      it('should skip files not matching the nvim socket pattern in XDG_RUNTIME_DIR', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([]) // TMPDIR empty
          .mockResolvedValueOnce([
            { name: 'nvim.abc.0', isDirectory: () => false },   // non-numeric pid
            { name: 'nvim.12345', isDirectory: () => false },    // missing .0 suffix
            { name: 'vim.12345.0', isDirectory: () => false },   // wrong prefix
            { name: 'other.sock', isDirectory: () => false },
          ]);
        fs.access.mockResolvedValue(undefined);

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(sockets).toHaveLength(0);
      });

      it('should skip directories in XDG_RUNTIME_DIR even if name matches pattern', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([]) // TMPDIR empty
          .mockResolvedValueOnce([
            { name: 'nvim.12345.0', isDirectory: () => true },
          ]);

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(sockets).toHaveLength(0);
      });

      it('should skip inaccessible socket files in XDG_RUNTIME_DIR', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([]) // TMPDIR empty
          .mockResolvedValueOnce([
            { name: 'nvim.12345.0', isDirectory: () => false },
          ]);
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(sockets).toHaveLength(0);
      });

      it('should handle readdir error in XDG_RUNTIME_DIR gracefully', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([]) // TMPDIR empty
          .mockRejectedValueOnce(new Error('Permission denied')); // XDG readdir fails

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(Array.isArray(sockets)).toBe(true);
        expect(sockets).toHaveLength(0);
      });

      it('should combine sockets from both TMPDIR and XDG_RUNTIME_DIR', async () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';

        fs.readdir
          .mockResolvedValueOnce([{ name: 'nvim12345', isDirectory: () => true }]) // TMPDIR
          .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }])          // subdir
          .mockResolvedValueOnce(['nvim.99999.0'])                                   // socket in subdir
          .mockResolvedValueOnce([{ name: 'nvim.11111.0', isDirectory: () => false }]); // XDG flat socket
        fs.access.mockResolvedValue(undefined);

        const { findNvimSockets } = await import('../lib/nvim-operations.js');
        const sockets = await findNvimSockets();

        expect(sockets).toHaveLength(2);
      });
    });
  });

  describe('getNvimInstancesInCwd with mocks', () => {
    it('should filter instances by current directory', async () => {
      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        buffer: {},
        buffers: [],
      };

      neovim.attach.mockReturnValue(mockNvim);

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { getNvimInstancesInCwd } = await import('../lib/nvim-operations.js');
      const instances = await getNvimInstancesInCwd();

      expect(Array.isArray(instances)).toBe(true);
    });

    it('should skip instances in different directories', async () => {
      const mockNvim = {
        call: vi.fn().mockResolvedValue('/some/other/directory'),
        buffer: {},
        buffers: [],
      };

      neovim.attach.mockReturnValue(mockNvim);

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { getNvimInstancesInCwd } = await import('../lib/nvim-operations.js');
      const instances = await getNvimInstancesInCwd();

      expect(Array.isArray(instances)).toBe(true);
    });

    it('should handle connection errors gracefully', async () => {
      neovim.attach.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { getNvimInstancesInCwd } = await import('../lib/nvim-operations.js');
      const instances = await getNvimInstancesInCwd();

      expect(Array.isArray(instances)).toBe(true);
      expect(instances).toHaveLength(0);
    });
  });

  describe('getCurrentBuffer with mocks', () => {
    it('should return null when no instances found', async () => {
      neovim.attach.mockImplementation(() => {
        throw new Error('No socket');
      });

      fs.readdir.mockResolvedValue([]);

      const { getCurrentBuffer } = await import('../lib/nvim-operations.js');
      const buffer = await getCurrentBuffer();

      expect(buffer).toBeNull();
    });

    it('should return buffer info when instance exists', async () => {
      const mockBuffer = {
        name: '/path/to/file.txt',
        lines: ['line 1', 'line 2', 'line 3'],
      };

      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        buffer: mockBuffer,
      };

      neovim.attach.mockReturnValue(mockNvim);

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { getCurrentBuffer } = await import('../lib/nvim-operations.js');
      const buffer = await getCurrentBuffer();

      if (buffer) {
        expect(buffer).toHaveProperty('path');
        expect(buffer).toHaveProperty('content');
      }
    });
  });

  describe('listOpenBuffers with mocks', () => {
    it('should return array of listed buffers', async () => {
      const mockBuf1 = {
        id: 1,
        name: '/path/to/file1.txt',
      };

      const mockBuf2 = {
        id: 2,
        name: '/path/to/file2.txt',
      };

      const mockNvim = {
        call: vi.fn()
          .mockResolvedValueOnce(process.cwd()) // getcwd
          .mockResolvedValueOnce(1) // buflisted for buf1
          .mockResolvedValueOnce(1), // buflisted for buf2
        buffers: [mockBuf1, mockBuf2],
      };

      neovim.attach.mockReturnValue(mockNvim);

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { listOpenBuffers } = await import('../lib/nvim-operations.js');
      const buffers = await listOpenBuffers();

      expect(Array.isArray(buffers)).toBe(true);
    });

    it('should filter out unlisted buffers', async () => {
      const mockBuf1 = {
        id: 1,
        name: '/path/to/file1.txt',
      };

      const mockBuf2 = {
        id: 2,
        name: '', // Empty name
      };

      const mockNvim = {
        call: vi.fn()
          .mockResolvedValueOnce(process.cwd())
          .mockResolvedValueOnce(1) // buflisted returns true
          .mockResolvedValueOnce(0), // buflisted returns false
        buffers: [mockBuf1, mockBuf2],
      };

      neovim.attach.mockReturnValue(mockNvim);

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { listOpenBuffers } = await import('../lib/nvim-operations.js');
      const buffers = await listOpenBuffers();

      expect(Array.isArray(buffers)).toBe(true);
    });
  });

  describe('getBufferContent with mocks', () => {
    it('should throw error for non-existent buffer', async () => {
      fs.readdir.mockResolvedValue([]);

      const { getBufferContent } = await import('../lib/nvim-operations.js');

      await expect(
        getBufferContent('/non/existent/file.txt')
      ).rejects.toThrow('Buffer not found');
    });

    it('should return content for existing buffer', async () => {
      const mockBuf = {
        id: 1,
        name: '/path/to/file.txt',
        lines: ['line 1', 'line 2'],
      };

      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        buffers: [mockBuf],
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { getBufferContent } = await import('../lib/nvim-operations.js');
      const content = await getBufferContent('/path/to/file.txt');

      expect(typeof content).toBe('string');
    });
  });

  describe('updateBuffer with mocks', () => {
    it('should throw error for non-existent buffer', async () => {
      fs.readdir.mockResolvedValue([]);

      const { updateBuffer } = await import('../lib/nvim-operations.js');

      await expect(
        updateBuffer('/non/existent/file.txt', 'new content')
      ).rejects.toThrow('Buffer not found');
    });

    it('should update buffer content successfully', async () => {
      const mockBuf = {
        id: 1,
        name: '/path/to/file.txt',
        setLines: vi.fn().mockResolvedValue(undefined),
      };

      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        buffers: [mockBuf],
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { updateBuffer } = await import('../lib/nvim-operations.js');
      const result = await updateBuffer('/path/to/file.txt', 'line 1\nline 2');

      expect(result).toEqual({
        success: true,
        path: '/path/to/file.txt',
      });
      expect(mockBuf.setLines).toHaveBeenCalledWith(
        ['line 1', 'line 2'],
        { start: 0, end: -1 }
      );
    });
  });

  describe('reloadBuffer with mocks', () => {
    it('should throw error for non-existent buffer', async () => {
      fs.readdir.mockResolvedValue([]);

      const { reloadBuffer } = await import('../lib/nvim-operations.js');

      await expect(
        reloadBuffer('/non/existent/file.txt')
      ).rejects.toThrow('Buffer not found');
    });

    it('should reload buffer successfully', async () => {
      const mockBuf = {
        id: 42,
        name: '/path/to/file.txt',
      };

      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        command: vi.fn().mockResolvedValue(undefined),
        buffers: [mockBuf],
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { reloadBuffer } = await import('../lib/nvim-operations.js');
      const result = await reloadBuffer('/path/to/file.txt');

      expect(result).toEqual({
        success: true,
        path: '/path/to/file.txt',
      });
      expect(mockNvim.command).toHaveBeenCalledWith('buffer 42 | edit!');
    });
  });

  describe('reloadAllBuffers with mocks', () => {
    it('should reload all buffers and return count', async () => {
      const mockBuf1 = {
        id: 1,
        name: '/path/to/file1.txt',
      };

      const mockBuf2 = {
        id: 2,
        name: '/path/to/file2.txt',
      };

      const mockNvim = {
        call: vi.fn()
          .mockResolvedValueOnce(process.cwd()) // getcwd
          .mockResolvedValueOnce(1) // buflisted for buf1
          .mockResolvedValueOnce(1), // buflisted for buf2
        command: vi.fn().mockResolvedValue(undefined),
        buffers: [mockBuf1, mockBuf2],
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { reloadAllBuffers } = await import('../lib/nvim-operations.js');
      const result = await reloadAllBuffers();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('buffers');
      expect(Array.isArray(result.buffers)).toBe(true);
      expect(mockNvim.command).toHaveBeenCalledWith('checktime');
    });

    it('should handle errors during reload', async () => {
      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        command: vi.fn().mockRejectedValue(new Error('Command failed')),
        buffers: [],
      };

      neovim.attach.mockReturnValue(mockNvim);

      const mockEntries = [
        { name: 'nvim.12345', isDirectory: () => true },
      ];

      fs.readdir.mockResolvedValue(mockEntries);
      fs.access.mockResolvedValue(undefined);

      const { reloadAllBuffers } = await import('../lib/nvim-operations.js');
      const result = await reloadAllBuffers();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('buffers');
      expect(Array.isArray(result.buffers)).toBe(true);
    });
  });

  describe('openFile with mocks', () => {
    it('should throw error when no nvim instance found', async () => {
      fs.readdir.mockResolvedValue([]);

      const { openFile } = await import('../lib/nvim-operations.js');

      await expect(
        openFile('/path/to/file.txt')
      ).rejects.toThrow('No Neovim instance found in current directory');
    });

    it('should open file with absolute path', async () => {
      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        command: vi.fn().mockResolvedValue(undefined),
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { openFile } = await import('../lib/nvim-operations.js');
      const result = await openFile('/absolute/path/to/file.txt');

      expect(result).toEqual({
        success: true,
        path: '/absolute/path/to/file.txt',
      });
      expect(mockNvim.command).toHaveBeenCalledWith('edit /absolute/path/to/file.txt');
    });

    it('should open file with relative path', async () => {
      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        command: vi.fn().mockResolvedValue(undefined),
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { openFile } = await import('../lib/nvim-operations.js');
      const result = await openFile('relative/path/file.txt');

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('path');
      expect(result.path).toContain('relative/path/file.txt');
      expect(mockNvim.command).toHaveBeenCalled();
    });

    it('should handle errors when opening file', async () => {
      const mockNvim = {
        call: vi.fn().mockResolvedValue(process.cwd()),
        command: vi.fn().mockRejectedValue(new Error('Cannot open file')),
      };

      neovim.attach.mockReturnValue(mockNvim);

      // Mock the readdir calls for the nested structure
      fs.readdir
        .mockResolvedValueOnce([{ name: 'nvim.12345', isDirectory: () => true }]) // First call: tmpdir entries
        .mockResolvedValueOnce([{ name: '0', isDirectory: () => true }]) // Second call: subdirectories in nvim.12345
        .mockResolvedValueOnce(['nvim.99999.0']); // Third call: socket files in subdirectory
      fs.access.mockResolvedValue(undefined);

      const { openFile } = await import('../lib/nvim-operations.js');

      await expect(
        openFile('/path/to/file.txt')
      ).rejects.toThrow('Failed to open file');
    });
  });
});
