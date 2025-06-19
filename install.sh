#!/bin/bash

# MCP Software Engineer Server Installation Script

set -e

echo "🚀 Installing MCP Software Engineer Server..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

echo "✅ Build completed successfully!"

# Get the absolute path of the built server
SERVER_PATH=$(pwd)/dist/index.js

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Add the following configuration to your Claude Desktop config file:"
echo ""
echo '{
  "mcpServers": {
    "software-engineer": {
      "command": "node",
      "args": ["'$SERVER_PATH'"],
      "env": {}
    }
  }
}'
echo ""
echo "2. Restart Claude Desktop"
echo "3. Start building amazing applications! 🚀"
echo ""
echo "📖 For documentation and usage examples, see: README.md"
echo "🐛 Report issues at: https://github.com/your-repo/mcp-software-engineer/issues"
