# MCP Software Engineer Server - Quick Setup Guide

## 🚀 Quick Installation

1. **Install and Build:**
```bash
# Clone or navigate to the project directory
cd mcp-software-engineer

# Run the installation script
./install.sh
```

2. **Configure Claude Desktop:**

Add this configuration to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "software-engineer": {
      "command": "node",
      "args": ["/FULL/PATH/TO/mcp-software-engineer/dist/index.js"],
      "env": {}
    }
  }
}
```

⚠️ **Important:** Replace `/FULL/PATH/TO/mcp-software-engineer` with the actual absolute path to your project directory.

3. **Restart Claude Desktop**

## 🧪 Testing

After setup, test the integration by asking Claude:

```
Can you list the available development tools?
```

Claude should respond with a list of available tools for project creation, database management, and more.

## 🛠️ Available Tools

### Core Tools Currently Available:
- **create_project** - Create new projects with various frameworks
- **read_file** / **write_file** - File operations
- **create_directory** / **list_files** / **search_files** - Directory operations
- **init_database** - Initialize databases with ORMs
- **create_migration** / **run_migrations** - Database migrations
- **generate_model** - Generate database models
- **seed_database** / **backup_database** - Database utilities
- **query_database** - Execute database queries

### Example Usage:

Ask Claude to:
```
Create a new React project with TypeScript and database support in /tmp/my-app
```

```
Setup a PostgreSQL database with Prisma for my project
```

```
Create a user model with email, name, and created_at fields
```

## 🔧 Troubleshooting

1. **Path Issues:** Ensure you use the absolute path in the configuration
2. **Permission Errors:** Make sure Claude has permission to execute the server
3. **Build Errors:** Run `npm run build` again if you make changes
4. **Connection Issues:** Check that the path in the config matches your actual file location

## 📚 Next Steps

- Check the main README.md for comprehensive documentation
- Explore the available tools by asking Claude what it can do
- Start building your projects with Claude's assistance!
