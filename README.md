# MCP Software Engineer Server

A comprehensive Model Context Protocol (MCP) server that enables Claude to work as a full-stack software engineer with complete development capabilities.

## Features

### 🚀 Project Management
- **Project Creation**: Initialize projects with popular frameworks (React, Vue, Angular, Express, FastAPI, Django, etc.)
- **Full-Stack Templates**: Ready-to-use templates with frontend, backend, and database integration
- **Technology Stack Selection**: Automatic setup with TypeScript, authentication, testing, and more

### 💾 Database Operations
- **Multi-Database Support**: PostgreSQL, MySQL, SQLite, MongoDB, Redis
- **ORM Integration**: Prisma, TypeORM, Sequelize, Mongoose, Drizzle
- **Migration Management**: Create and run database migrations
- **Model Generation**: Auto-generate database models and schemas
- **Seeding & Backup**: Database seeding and backup utilities

### 🎨 Frontend Development
- **Component Generation**: Create React, Vue, Angular, Svelte components
- **Styling Solutions**: Tailwind CSS, Bootstrap, Material-UI, Styled Components
- **Page & Routing**: Setup pages with routing (React Router, Vue Router, etc.)
- **State Management**: Redux, Zustand, Vuex, Pinia, NgRx
- **Form Handling**: React Hook Form, Formik, VeeValidate with validation
- **Bundle Optimization**: Webpack, Vite optimization configurations

### ⚙️ Backend Development
- **API Endpoints**: RESTful API creation with full CRUD operations
- **Authentication**: JWT, OAuth2, Passport.js, session-based auth
- **Middleware**: Custom middleware for auth, CORS, rate limiting, logging
- **WebSockets**: Real-time communication setup
- **Background Jobs**: Task queues with Bull, Agenda, Celery
- **Validation**: Request validation with Joi, Yup, Zod, Pydantic

### 🚢 Deployment & DevOps
- **Containerization**: Docker and Docker Compose generation
- **Cloud Deployment**: AWS, GCP, Azure, Vercel, Netlify, Heroku
- **CI/CD Pipelines**: GitHub Actions, GitLab CI, Jenkins
- **SSL/TLS**: Let's Encrypt, Cloudflare, AWS ACM
- **Load Balancing**: Nginx, HAProxy, cloud load balancers
- **Monitoring**: Prometheus, Grafana, Sentry, DataDog

### 🧪 Testing & Quality
- **Testing Frameworks**: Jest, Vitest, Pytest, Mocha
- **Test Types**: Unit, integration, end-to-end testing
- **Code Quality**: ESLint, Prettier, Git hooks with Husky
- **Security Scanning**: Dependency and code vulnerability scanning

### 🔧 Development Tools
- **Version Control**: Git repository initialization with best practices
- **File Operations**: Advanced file system operations
- **Caching**: Redis, Memcached, in-memory caching
- **Message Queues**: RabbitMQ, Kafka, SQS, Redis queues
- **AI Integration**: OpenAI, Anthropic, HuggingFace, TensorFlow

## Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd mcp-software-engineer
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the server:**
```bash
npm run build
```

4. **Configure Claude Desktop:**
Add to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "software-engineer": {
      "command": "node",
      "args": ["/path/to/mcp-software-engineer/dist/index.js"],
      "env": {}
    }
  }
}
```

## Available Tools

### Project & File Management
- `create_project` - Create new projects with various frameworks
- `read_file` - Read file contents
- `write_file` - Write content to files
- `create_directory` - Create directory structures
- `list_files` - List files and directories
- `search_files` - Search for text patterns in files

### Database Tools
- `init_database` - Initialize database with ORM
- `create_migration` - Create database migrations
- `run_migrations` - Execute migrations
- `generate_model` - Generate database models
- `seed_database` - Create and run database seeds
- `backup_database` - Create database backups
- `query_database` - Execute database queries

### Web Development
- `create_component` - Generate frontend components
- `setup_styling` - Configure CSS frameworks
- `create_page` - Create pages with routing
- `setup_routing` - Configure routing systems
- `setup_state_management` - Setup state management
- `setup_forms` - Configure form handling
- `optimize_bundle` - Optimize build configurations

### Backend Development
- `create_api_endpoint` - Create RESTful API endpoints
- `setup_authentication` - Configure authentication systems
- `create_middleware` - Create custom middleware
- `setup_validation` - Configure request validation
- `setup_websockets` - Setup WebSocket support
- `create_background_job` - Create background tasks
- `setup_logging` - Configure logging systems

### Deployment & DevOps
- `create_dockerfile` - Generate optimized Dockerfiles
- `create_docker_compose` - Create Docker Compose configurations
- `deploy_to_cloud` - Deploy to cloud providers
- `setup_ci_cd` - Configure CI/CD pipelines
- `setup_monitoring` - Setup application monitoring
- `setup_ssl` - Configure SSL/TLS certificates
- `setup_load_balancer` - Setup load balancing

### Testing & Quality
- `setup_testing` - Configure testing frameworks
- `create_test` - Generate test files
- `run_tests` - Execute tests with coverage
- `security_scan` - Run security scans

### Git & Version Control
- `init_repository` - Initialize Git repository
- `create_branch` - Create and switch branches
- `commit_changes` - Stage and commit changes
- `setup_hooks` - Configure Git hooks

## Usage Examples

### Create a Full-Stack Application
```typescript
// Create a new full-stack project
await createProject({
  name: "my-app",
  type: "full-stack",
  path: "/projects",
  features: ["typescript", "database", "auth", "testing", "docker"]
});

// Setup database
await initDatabase({
  type: "prisma",
  database: "postgresql",
  projectPath: "/projects/my-app"
});

// Create API endpoints
await createApiEndpoint({
  name: "User",
  framework: "express",
  methods: ["GET", "POST", "PUT", "DELETE"],
  authentication: true,
  validation: true,
  projectPath: "/projects/my-app"
});
```

### Setup Frontend with React
```typescript
// Create React components
await createComponent({
  name: "UserProfile",
  framework: "react",
  type: "functional",
  projectPath: "/projects/my-app",
  styling: "tailwind",
  withTests: true
});

// Setup state management
await setupStateManagement({
  type: "zustand",
  framework: "react",
  projectPath: "/projects/my-app"
});
```

### Deploy to Cloud
```typescript
// Create Dockerfile
await createDockerfile({
  framework: "node",
  type: "full-stack",
  projectPath: "/projects/my-app"
});

// Setup CI/CD
await setupCiCd({
  platform: "github-actions",
  projectPath: "/projects/my-app",
  stages: ["test", "build", "deploy"],
  deploymentTarget: "aws"
});
```

## Requirements

- Node.js 18 or higher
- npm or yarn
- Git
- Docker (optional, for containerization)
- Various language runtimes depending on project type

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your improvements
4. Write tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.
