# Neovim MCP Server

MCP (Model Context Protocol) server that integrates Neovim buffers with Claude Code, enabling seamless buffer awareness and real-time updates.

## Features

### Resources (Auto-available Context)
- **`nvim://current-buffer`** - Currently active buffer with path and content
- **`nvim://open-buffers`** - List of all open buffers with metadata

### Tools (Claude Can Invoke)
- **`list_nvim_buffers()`** - List all open buffers in nvim instances running in current directory
- **`get_current_buffer()`** - Get the currently active buffer
- **`get_buffer_content(path)`** - Get content of a specific buffer by path
- **`update_buffer(path, content)`** - Update buffer content directly in nvim (changes appear immediately!)
- **`open_file(path)`** - Open a file in nvim (useful after creating new files)
- **`reload_buffer(path)`** - Reload a buffer from disk
- **`reload_all_buffers()`** - Check and reload all buffers that changed on disk

## Setup with Claude Code

### Option 1: Using the CLI (Recommended)

Run the following command in your terminal:

```bash
claude mcp add --transport stdio nvim -- npx nvim-mcp-server
```

This will automatically add the server to your `~/.claude.json` configuration.

### Option 2: Manual Configuration

Alternatively, manually edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "nvim": {
      "command": "npx",
      "args": ["nvim-mcp-server"]
    }
  }
}
```

After adding the configuration, restart Claude Code for changes to take effect.

### Verify Setup

Check that the server is configured correctly:

```bash
claude mcp list
```

Or use `/mcp` within Claude Code to check server status.

## Usage

Once configured, the MCP server will automatically:

1. **Detect Neovim instances** running in the current directory
2. **Expose buffer context** to Claude via resources
3. **Enable buffer operations** via tools

### Example Workflows

#### 1. Refactor Current File
```
You: "Refactor the current file to use async/await"

Claude:
- Reads nvim://current-buffer resource automatically
- Sees you're working on src/api.js
- Refactors the code
- Calls update_buffer() to push changes to nvim
- Changes appear instantly in your editor!
```

#### 2. Check Open Buffers
```
You: "What files do I have open in nvim?"

Claude:
- Calls list_nvim_buffers() tool
- Shows you all open buffers
```

#### 3. Update Specific Buffer
```
You: "Add error handling to src/utils.js"

Claude:
- Calls get_buffer_content("src/utils.js")
- Adds error handling
- Calls update_buffer() to apply changes
- You see updates in nvim immediately
```

#### 4. Create and Open New File
```
You: "Create a new component called Button.jsx"

Claude:
- Creates the file using Write tool
- Calls open_file("src/components/Button.jsx")
- File opens in your nvim automatically
- You can continue editing right away!
```

## How It Works

1. **Discovery:** Uses `$TMPDIR` to find nvim socket files
2. **Filtering:** Only connects to nvim instances running in the current directory
3. **RPC Communication:** Uses the `neovim` npm package to communicate via msgpack-rpc
4. **MCP Integration:** Exposes nvim buffers as MCP resources and tools

### Socket Discovery

The server finds nvim sockets by searching multiple locations:

**Search Directories:**
- `$TMPDIR` (or `/tmp` if not set)
- `$XDG_RUNTIME_DIR` (if available)
- `/run/user/$UID` (Linux systems)

**Socket Patterns:**
- **Direct sockets:** `nvim.{pid}.0` files in base directories
- **Nested structure:** `nvim*/0/nvim.{pid}.0` (legacy format)
- **Compatibility:** Supports both Neovim 0.10 and 0.11+ socket formats

**Examples:**
- **macOS:** `/var/folders/.../T/nvim.12345.0`
- **Linux:** `/tmp/nvim.12345.0` or `/run/user/1000/nvim.12345.0`
- **Legacy:** `/tmp/nvim.12345/0/nvim.12345.0`

## Benefits

### Real-Time Updates
**Traditional:**
```
Claude writes to file → You reload in nvim
```

**With MCP:**
```
Claude updates buffer via RPC → Changes appear instantly
```

### Context Awareness
Claude automatically knows:
- Which file you're currently editing
- All files you have open
- Can make changes directly in your editor

### Seamless Integration
- No file writes needed (updates are in-memory)
- Works with unsaved buffers
- Normal nvim undo/redo works
- Triggers autocmds (LSP, linting, etc.)

## Troubleshooting

### No Neovim instances found
- Make sure you're running the command from the same directory as your nvim instance
- Check that nvim is running: `ps aux | grep nvim`
- Verify socket exists: `ls $TMPDIR/nvim*/0`

### Buffer updates not appearing
- Ensure the buffer path matches exactly (use absolute paths)
- Check that the buffer is listed: `:ls` in nvim
- Verify the MCP server has permissions to access the socket

### MCP server not connecting
- Restart Claude Code after adding the MCP configuration
- Check Claude Code logs for errors
- Verify the path in the config is absolute and correct

## Development

### Test the server manually:
```bash
node index.js
```

The server communicates via stdio, so you'll need an MCP client (like Claude Code) to interact with it properly.

### Debug mode:
The server logs errors to stderr, which you can see in Claude Code's MCP server logs.

### Running tests:
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Interactive UI
npm run test:coverage # With coverage report
```

## Publishing

The project includes automated release scripts for publishing to npm.

### Prerequisites:
- Clean git working directory
- Tests must pass
- npm authentication configured (`npm login`)

### Release commands:

**Patch release** (1.0.0 → 1.0.1):
```bash
npm run release:patch
```

**Minor release** (1.0.0 → 1.1.0):
```bash
npm run release:minor
```

**Major release** (1.0.0 → 2.0.0):
```bash
npm run release:major
```

**Specific version**:
```bash
npm run release 1.2.3
```

### What the release script does:
1. Validates git working directory is clean
2. Runs all tests
3. Bumps version in package.json
4. Creates git commit with version bump
5. Creates git tag (e.g., v1.0.1)
6. Publishes to npm
7. Pushes commit and tags to git

If any step fails, the script will abort and rollback changes.

## Requirements

- Node.js 16+
- Neovim with RPC support (any recent version)
- Running nvim instance in the directory where you invoke Claude

## License

MIT
