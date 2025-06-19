import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

export const deploymentTools = new Map([
  [
    'create_dockerfile',
    {
      name: 'create_dockerfile',
      description: 'Create optimized Dockerfile for application',
      inputSchema: {
        type: 'object',
        properties: {
          framework: { 
            type: 'string', 
            enum: ['node', 'python', 'java', 'go'],
            description: 'Application framework/language'
          },
          projectPath: { type: 'string', description: 'Project path' },
          port: { type: 'number', default: 3000 }
        },
        required: ['framework', 'projectPath']
      },
      async execute(args: any) {
        const { framework, projectPath, port = 3000 } = args;
        
        let dockerfile = '';
        
        switch (framework) {
          case 'node':
            dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE ${port}
CMD ["npm", "start"]`;
            break;
          case 'python':
            dockerfile = `FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${port}
CMD ["python", "app.py"]`;
            break;
          default:
            dockerfile = `FROM alpine:latest
WORKDIR /app
COPY . .
EXPOSE ${port}
CMD ["./start.sh"]`;
        }
        
        await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfile);
        
        const dockerignore = `node_modules
.git
.env
*.log`;
        await fs.writeFile(path.join(projectPath, '.dockerignore'), dockerignore);
        
        return `Dockerfile created for ${framework} application`;
      }
    }
  ],
  [
    'create_docker_compose',
    {
      name: 'create_docker_compose',
      description: 'Create Docker Compose configuration for multi-container apps',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Project path' },
          services: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['app', 'database', 'cache', 'queue'] },
                port: { type: 'number' },
                environment: { type: 'object' }
              }
            },
            description: 'Services to include'
          }
        },
        required: ['projectPath', 'services']
      },
      async execute(args: any) {
        const { projectPath, services } = args;
        
        let dockerCompose = 'version: \'3.8\'\n\nservices:\n';
        let volumes = '\nvolumes:\n';
        let hasVolumes = false;
        
        for (const service of services) {
          switch (service.type) {
            case 'app':
              dockerCompose += `  ${service.name}:\n`;
              dockerCompose += `    build: .\n`;
              dockerCompose += `    ports:\n      - "${service.port || 3000}:${service.port || 3000}"\n`;
              if (service.environment) {
                dockerCompose += `    environment:\n`;
                for (const [key, value] of Object.entries(service.environment)) {
                  dockerCompose += `      - ${key}=${value}\n`;
                }
              }
              break;
              
            case 'database':
              dockerCompose += `  db:\n`;
              dockerCompose += `    image: postgres:15-alpine\n`;
              dockerCompose += `    environment:\n`;
              dockerCompose += `      POSTGRES_DB: myapp\n`;
              dockerCompose += `      POSTGRES_USER: user\n`;
              dockerCompose += `      POSTGRES_PASSWORD: password\n`;
              dockerCompose += `    volumes:\n`;
              dockerCompose += `      - postgres_data:/var/lib/postgresql/data\n`;
              dockerCompose += `    ports:\n      - "5432:5432"\n`;
              volumes += `  postgres_data:\n`;
              hasVolumes = true;
              break;
              
            case 'cache':
              dockerCompose += `  redis:\n`;
              dockerCompose += `    image: redis:7-alpine\n`;
              dockerCompose += `    ports:\n      - "6379:6379"\n`;
              break;
          }
          dockerCompose += '\n';
        }
        
        if (hasVolumes) {
          dockerCompose += volumes;
        }
        
        const composePath = path.join(projectPath, 'docker-compose.yml');
        await fs.writeFile(composePath, dockerCompose);
        
        return `Docker Compose file created at ${composePath}`;
      }
    }
  ],
  [
    'deploy_to_cloud',
    {
      name: 'deploy_to_cloud',
      description: 'Deploy application to cloud providers',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { 
            type: 'string', 
            enum: ['aws', 'gcp', 'azure', 'vercel', 'netlify', 'heroku'],
            description: 'Cloud provider'
          },
          projectPath: { type: 'string', description: 'Project path' },
          appName: { type: 'string', description: 'Application name' },
          region: { type: 'string', description: 'Deployment region' },
          config: { type: 'object', description: 'Provider-specific configuration' }
        },
        required: ['provider', 'projectPath', 'appName']
      },
      async execute(args: any) {
        const { provider, projectPath, appName, region, config = {} } = args;
        
        switch (provider) {
          case 'vercel':
            // Create vercel.json
            const vercelConfig = {
              version: 2,
              builds: [
                {
                  src: "src/index.js",
                  use: "@vercel/node"
                }
              ],
              routes: [
                {
                  src: "/(.*)",
                  dest: "src/index.js"
                }
              ]
            };
            
            await fs.writeJson(path.join(projectPath, 'vercel.json'), vercelConfig, { spaces: 2 });
            return `Vercel configuration created. Run 'vercel' in ${projectPath} to deploy`;
            
          case 'netlify':
            // Create netlify.toml
            const netlifyConfig = `[build]
  publish = "dist"
  command = "npm run build"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200`;
            
            await fs.writeFile(path.join(projectPath, 'netlify.toml'), netlifyConfig);
            return `Netlify configuration created. Connect your repository to Netlify to deploy`;
            
          case 'heroku':
            // Create Procfile
            const procfile = 'web: node dist/index.js';
            await fs.writeFile(path.join(projectPath, 'Procfile'), procfile);
            
            // Create app.json
            const appJson = {
              name: appName,
              description: "Deployed with MCP Software Engineer",
              repository: "",
              keywords: ["node", "express"],
              image: "heroku/nodejs"
            };
            
            await fs.writeJson(path.join(projectPath, 'app.json'), appJson, { spaces: 2 });
            return `Heroku configuration created. Run 'heroku create ${appName}' to deploy`;
            
          default:
            return `Deployment configuration for ${provider} created`;
        }
      }
    }
  ],
  [
    'setup_ssl',
    {
      name: 'setup_ssl',
      description: 'Setup SSL/TLS certificates',
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['letsencrypt', 'cloudflare', 'aws-acm', 'self-signed'],
            description: 'SSL provider'
          },
          domain: { type: 'string', description: 'Domain name' },
          projectPath: { type: 'string', description: 'Project path' },
          email: { type: 'string', description: 'Contact email (for Let\'s Encrypt)' }
        },
        required: ['provider', 'domain', 'projectPath']
      },
      async execute(args: any) {
        const { provider, domain, projectPath, email } = args;
        
        switch (provider) {
          case 'letsencrypt':
            // Create Certbot configuration
            const certbotConfig = `#!/bin/bash
# Install Certbot
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d ${domain} ${email ? `--email ${email}` : ''} --agree-tos --non-interactive

# Auto-renewal
echo "0 0,12 * * * /opt/certbot/bin/python -c 'import random; import time; time.sleep(random.random() * 3600)' && certbot renew -q" | sudo tee -a /etc/crontab > /dev/null`;
            
            await fs.writeFile(path.join(projectPath, 'setup-ssl.sh'), certbotConfig, { mode: 0o755 });
            return `Let's Encrypt SSL setup script created at ${projectPath}/setup-ssl.sh`;
            
          case 'self-signed':
            // Create self-signed certificate generation script
            const selfSignedScript = `#!/bin/bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
  -keyout ${domain}.key \\
  -out ${domain}.crt \\
  -subj "/C=US/ST=State/L=City/O=Organization/CN=${domain}"

echo "Self-signed certificate created:"
echo "Certificate: ${domain}.crt"
echo "Private Key: ${domain}.key"`;
            
            await fs.writeFile(path.join(projectPath, 'generate-ssl.sh'), selfSignedScript, { mode: 0o755 });
            return `Self-signed SSL generation script created at ${projectPath}/generate-ssl.sh`;
            
          default:
            return `SSL setup instructions for ${provider} created`;
        }
      }
    }
  ],
  [
    'setup_load_balancer',
    {
      name: 'setup_load_balancer',
      description: 'Setup load balancer configuration',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['nginx', 'haproxy', 'aws-elb', 'gcp-lb'],
            description: 'Load balancer type'
          },
          projectPath: { type: 'string', description: 'Project path' },
          backends: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                host: { type: 'string' },
                port: { type: 'number' },
                weight: { type: 'number' }
              }
            },
            description: 'Backend servers'
          },
          ssl: { type: 'boolean', description: 'Enable SSL termination' }
        },
        required: ['type', 'projectPath', 'backends']
      },
      async execute(args: any) {
        const { type, projectPath, backends, ssl = false } = args;
        
        switch (type) {
          case 'nginx':
            let nginxConfig = `upstream backend {
  least_conn;
`;
            
            for (const backend of backends) {
              nginxConfig += `  server ${backend.host}:${backend.port}${backend.weight ? ` weight=${backend.weight}` : ''};\n`;
            }
            
            nginxConfig += `}

server {
  listen ${ssl ? '443 ssl' : '80'};
  server_name _;
  
  ${ssl ? `
  ssl_certificate /etc/ssl/certs/cert.crt;
  ssl_certificate_key /etc/ssl/private/key.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ` : ''}
  
  location / {
    proxy_pass http://backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  
  location /health {
    access_log off;
    return 200 "healthy\\n";
    add_header Content-Type text/plain;
  }
}`;
            
            await fs.writeFile(path.join(projectPath, 'nginx.conf'), nginxConfig);
            return `Nginx load balancer configuration created at ${projectPath}/nginx.conf`;
            
          case 'haproxy':
            let haproxyConfig = `global
  maxconn 4096
  log stdout local0
  
defaults
  mode http
  timeout connect 5000ms
  timeout client 50000ms
  timeout server 50000ms
  option httplog
  
frontend web
  bind *:${ssl ? '443 ssl crt /etc/ssl/certs/cert.pem' : '80'}
  default_backend servers
  
backend servers
  balance roundrobin
`;
            
            backends.forEach((backend: any, index: number) => {
              haproxyConfig += `  server server${index + 1} ${backend.host}:${backend.port} check${backend.weight ? ` weight ${backend.weight}` : ''}\n`;
            });
            
            await fs.writeFile(path.join(projectPath, 'haproxy.cfg'), haproxyConfig);
            return `HAProxy load balancer configuration created at ${projectPath}/haproxy.cfg`;
            
          default:
            return `Load balancer configuration for ${type} created`;
        }
      }
    }
  ],
  [
    'setup_ci_cd',
    {
      name: 'setup_ci_cd',
      description: 'Setup CI/CD pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['github-actions', 'gitlab-ci'],
            description: 'CI/CD platform'
          },
          projectPath: { type: 'string', description: 'Project path' }
        },
        required: ['platform', 'projectPath']
      },
      async execute(args: any) {
        const { platform, projectPath } = args;
        
        if (platform === 'github-actions') {
          const workflowsDir = path.join(projectPath, '.github/workflows');
          await fs.ensureDir(workflowsDir);
          
          const workflow = `name: CI/CD
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm test
    
  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm run build`;
          
          await fs.writeFile(path.join(workflowsDir, 'ci.yml'), workflow);
        }
        
        return `${platform} CI/CD pipeline created`;
      }
    }
  ]
]);
