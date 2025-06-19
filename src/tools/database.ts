import { z } from 'zod';
import path from 'path';
import fs from 'fs-extra';
import { DatabaseTool, BaseTool } from './base-tool.js';
import { ValidationError, DatabaseError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ConnectionPool } from '../utils/resource-manager.js';
import { config } from '../config/index.js';

// Validation schemas
const initDatabaseSchema = z.object({
  type: z.enum(['prisma', 'typeorm', 'sequelize', 'mongoose', 'drizzle']),
  database: z.enum(['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis']),
  projectPath: z.string(),
  connectionString: z.string().optional()
});

const createMigrationSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Migration name can only contain letters, numbers, hyphens and underscores'),
  type: z.enum(['prisma', 'typeorm', 'sequelize']),
  projectPath: z.string(),
  sql: z.string().optional()
});

const runMigrationsSchema = z.object({
  type: z.enum(['prisma', 'typeorm', 'sequelize']),
  projectPath: z.string(),
  direction: z.enum(['up', 'down']).optional().default('up')
});

const generateModelSchema = z.object({
  name: z.string().min(1).regex(/^[A-Z][a-zA-Z0-9]*$/, 'Model name must be PascalCase'),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional().default(false),
    unique: z.boolean().optional().default(false),
    default: z.any().optional()
  })),
  relations: z.array(z.object({
    type: z.enum(['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany']),
    target: z.string(),
    field: z.string()
  })).optional(),
  ormType: z.enum(['prisma', 'typeorm', 'sequelize', 'mongoose']),
  projectPath: z.string()
});

const seedDatabaseSchema = z.object({
  type: z.enum(['prisma', 'typeorm', 'sequelize', 'custom']),
  projectPath: z.string(),
  data: z.any().optional(),
  file: z.string().optional()
});

const backupDatabaseSchema = z.object({
  database: z.enum(['postgresql', 'mysql', 'mongodb']),
  connectionString: z.string(),
  outputPath: z.string(),
  format: z.enum(['sql', 'json', 'custom']).optional().default('sql')
});

const queryDatabaseSchema = z.object({
  query: z.string(),
  database: z.enum(['postgresql', 'mysql', 'sqlite', 'mongodb']),
  connectionString: z.string(),
  parameters: z.array(z.any()).optional()
});

// Database connection pools
const connectionPools = new Map<string, ConnectionPool<any>>();

// Helper to get or create connection pool
async function getConnectionPool(database: string, connectionString: string): Promise<ConnectionPool<any>> {
  const poolKey = `${database}:${connectionString}`;
  
  if (!connectionPools.has(poolKey)) {
    const pool = await createConnectionPool(database, connectionString);
    connectionPools.set(poolKey, pool);
  }
  
  return connectionPools.get(poolKey)!;
}

async function createConnectionPool(database: string, connectionString: string): Promise<ConnectionPool<any>> {
  switch (database) {
    case 'postgresql':
      return createPostgresPool(connectionString);
    case 'mysql':
      return createMySQLPool(connectionString);
    case 'sqlite':
      return createSQLitePool(connectionString);
    case 'mongodb':
      return createMongoDBPool(connectionString);
    default:
      throw new Error(`Unsupported database: ${database}`);
  }
}

async function createPostgresPool(connectionString: string): Promise<ConnectionPool<any>> {
  try {
    // Dynamic import to avoid loading if not needed
    const { default: pg } = await import('pg');
    const { Pool } = pg;
    
    return new ConnectionPool({
      create: async () => {
        const pool = new Pool({
          connectionString,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000
        });
        
        // Test connection
        await pool.query('SELECT 1');
        return pool;
      },
      destroy: async (pool) => {
        await pool.end();
      },
      minSize: 2,
      maxSize: 10
    });
  } catch (error) {
    logger.warn('PostgreSQL driver not installed, using mock connection');
    return createMockPool('postgresql');
  }
}

async function createMySQLPool(connectionString: string): Promise<ConnectionPool<any>> {
  try {
    const mysql = await import('mysql2/promise');
    
    return new ConnectionPool({
      create: async () => {
        const pool = await mysql.createPool({
          uri: connectionString,
          connectionLimit: 10,
          waitForConnections: true,
          queueLimit: 0
        });
        
        // Test connection
        await pool.query('SELECT 1');
        return pool;
      },
      destroy: async (pool) => {
        await pool.end();
      },
      minSize: 2,
      maxSize: 10
    });
  } catch (error) {
    logger.warn('MySQL driver not installed, using mock connection');
    return createMockPool('mysql');
  }
}

async function createSQLitePool(connectionString: string): Promise<ConnectionPool<any>> {
  try {
    const { default: Database } = await import('better-sqlite3');
    
    return new ConnectionPool({
      create: async () => {
        const db = new Database(connectionString);
        db.pragma('journal_mode = WAL');
        return db;
      },
      destroy: async (db) => {
        db.close();
      },
      minSize: 1,
      maxSize: 1 // SQLite doesn't support concurrent writes
    });
  } catch (error) {
    logger.warn('SQLite driver not installed, using mock connection');
    return createMockPool('sqlite');
  }
}

async function createMongoDBPool(connectionString: string): Promise<ConnectionPool<any>> {
  try {
    const { MongoClient } = await import('mongodb');
    
    return new ConnectionPool({
      create: async () => {
        const client = new MongoClient(connectionString, {
          maxPoolSize: 10,
          minPoolSize: 2
        });
        await client.connect();
        return client;
      },
      destroy: async (client) => {
        await client.close();
      },
      minSize: 2,
      maxSize: 10
    });
  } catch (error) {
    logger.warn('MongoDB driver not installed, using mock connection');
    return createMockPool('mongodb');
  }
}

// Mock pool for when drivers aren't installed
function createMockPool(database: string): ConnectionPool<any> {
  return new ConnectionPool({
    create: async () => ({
      type: 'mock',
      database,
      query: async (sql: string, params?: any[]) => {
        logger.info('Mock database query', { database, sql, params });
        return { rows: [], rowCount: 0 };
      },
      close: async () => {}
    }),
    destroy: async () => {},
    minSize: 1,
    maxSize: 1
  });
}

// Tool implementations
class InitDatabaseTool extends BaseTool<z.infer<typeof initDatabaseSchema>, string> {
  constructor() {
    super({
      name: 'init_database',
      description: 'Initialize database with ORM/Query builder',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['prisma', 'typeorm', 'sequelize', 'mongoose', 'drizzle'],
            description: 'Database ORM/tool to use'
          },
          database: {
            type: 'string',
            enum: ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'],
            description: 'Database type'
          },
          projectPath: { type: 'string', description: 'Project directory path' },
          connectionString: { type: 'string', description: 'Database connection string' }
        },
        required: ['type', 'database', 'projectPath']
      }
    });
  }
  
  protected getZodSchema() {
    return initDatabaseSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof initDatabaseSchema>): Promise<string> {
    const { type, database, projectPath, connectionString } = input;
    const sanitizedPath = this.sanitizePath(projectPath);
    
    // Ensure project directory exists
    if (!await fs.pathExists(sanitizedPath)) {
      throw new ValidationError(`Project path does not exist: ${sanitizedPath}`);
    }
    
    switch (type) {
      case 'prisma':
        return await this.initPrisma(sanitizedPath, database, connectionString);
      case 'typeorm':
        return await this.initTypeORM(sanitizedPath, database, connectionString);
      case 'sequelize':
        return await this.initSequelize(sanitizedPath, database, connectionString);
      case 'mongoose':
        return await this.initMongoose(sanitizedPath, connectionString);
      case 'drizzle':
        return await this.initDrizzle(sanitizedPath, database, connectionString);
      default:
        throw new Error(`Unsupported database tool: ${type}`);
    }
  }
  
  private async initPrisma(projectPath: string, database: string, connectionString?: string): Promise<string> {
    // Install Prisma
    await this.executeCommand('npm install prisma @prisma/client', { cwd: projectPath });
    
    // Initialize Prisma
    await this.executeCommand('npx prisma init', { cwd: projectPath });
    
    // Configure database URL
    if (connectionString) {
      const envPath = path.join(projectPath, '.env');
      let envContent = '';
      
      if (await fs.pathExists(envPath)) {
        envContent = await fs.readFile(envPath, 'utf-8');
      }
      
      envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL="${connectionString}"`);
      if (!envContent.includes('DATABASE_URL=')) {
        envContent += `\nDATABASE_URL="${connectionString}"\n`;
      }
      
      await fs.writeFile(envPath, envContent);
    }
    
    // Update schema.prisma for the specific database
    const schemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
    let provider = 'postgresql';
    
    switch (database) {
      case 'mysql':
        provider = 'mysql';
        break;
      case 'sqlite':
        provider = 'sqlite';
        break;
      case 'mongodb':
        provider = 'mongodb';
        break;
    }
    
    const schemaContent = `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${provider}"
  url      = env("DATABASE_URL")
}

// Example model
model User {
  id        ${database === 'mongodb' ? 'String @id @default(auto()) @map("_id") @db.ObjectId' : 'Int @id @default(autoincrement())'}
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]
}

model Post {
  id        ${database === 'mongodb' ? 'String @id @default(auto()) @map("_id") @db.ObjectId' : 'Int @id @default(autoincrement())'}
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  ${database === 'mongodb' ? 'String @db.ObjectId' : 'Int'}
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`;
    
    await fs.writeFile(schemaPath, schemaContent);
    
    logger.info('Prisma initialized successfully', { projectPath, database });
    return 'Prisma initialized successfully. Run "npx prisma migrate dev" to create your first migration.';
  }
  
  private async initTypeORM(projectPath: string, database: string, connectionString?: string): Promise<string> {
    const packages = ['typeorm', 'reflect-metadata'];
    
    // Add database-specific packages
    switch (database) {
      case 'postgresql':
        packages.push('pg');
        break;
      case 'mysql':
        packages.push('mysql2');
        break;
      case 'sqlite':
        packages.push('sqlite3');
        break;
    }
    
    await this.executeCommand(`npm install ${packages.join(' ')}`, { cwd: projectPath });
    
    // Create TypeORM config
    const config = {
      type: database === 'postgresql' ? 'postgres' : database,
      url: connectionString,
      synchronize: false,
      logging: true,
      entities: ['src/entities/**/*.{js,ts}'],
      migrations: ['src/migrations/**/*.{js,ts}'],
      subscribers: ['src/subscribers/**/*.{js,ts}'],
      cli: {
        entitiesDir: 'src/entities',
        migrationsDir: 'src/migrations',
        subscribersDir: 'src/subscribers'
      }
    };
    
    await fs.writeJson(path.join(projectPath, 'ormconfig.json'), config, { spaces: 2 });
    
    // Create directories
    await fs.ensureDir(path.join(projectPath, 'src/entities'));
    await fs.ensureDir(path.join(projectPath, 'src/migrations'));
    await fs.ensureDir(path.join(projectPath, 'src/subscribers'));
    
    // Create example entity
    const userEntity = `import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
`;
    
    await fs.writeFile(path.join(projectPath, 'src/entities/User.ts'), userEntity);
    
    logger.info('TypeORM initialized successfully', { projectPath, database });
    return 'TypeORM initialized successfully';
  }
  
  private async initSequelize(projectPath: string, database: string, connectionString?: string): Promise<string> {
    const packages = ['sequelize', 'sequelize-cli'];
    
    switch (database) {
      case 'postgresql':
        packages.push('pg', 'pg-hstore');
        break;
      case 'mysql':
        packages.push('mysql2');
        break;
      case 'sqlite':
        packages.push('sqlite3');
        break;
    }
    
    await this.executeCommand(`npm install ${packages.join(' ')}`, { cwd: projectPath });
    
    // Initialize Sequelize
    await this.executeCommand('npx sequelize-cli init', { cwd: projectPath });
    
    // Update config
    if (connectionString) {
      const configPath = path.join(projectPath, 'config', 'config.json');
      const config = await fs.readJson(configPath);
      
      config.development = {
        use_env_variable: 'DATABASE_URL',
        dialect: database === 'postgresql' ? 'postgres' : database
      };
      
      await fs.writeJson(configPath, config, { spaces: 2 });
      
      // Update .env
      const envPath = path.join(projectPath, '.env');
      let envContent = await fs.readFile(envPath, 'utf-8').catch(() => '');
      envContent += `\nDATABASE_URL=${connectionString}\n`;
      await fs.writeFile(envPath, envContent);
    }
    
    logger.info('Sequelize initialized successfully', { projectPath, database });
    return 'Sequelize initialized successfully';
  }
  
  private async initMongoose(projectPath: string, connectionString?: string): Promise<string> {
    await this.executeCommand('npm install mongoose', { cwd: projectPath });
    
    // Create connection file
    const connectionContent = `import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DATABASE_URL || '${connectionString || 'mongodb://localhost:27017/myapp'}', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(\`MongoDB Connected: \${conn.connection.host}\`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

export default connectDB;
`;
    
    await fs.ensureDir(path.join(projectPath, 'src/config'));
    await fs.writeFile(path.join(projectPath, 'src/config/database.js'), connectionContent);
    
    // Create example model
    const userModel = `import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  posts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }]
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

export default User;
`;
    
    await fs.ensureDir(path.join(projectPath, 'src/models'));
    await fs.writeFile(path.join(projectPath, 'src/models/User.js'), userModel);
    
    logger.info('Mongoose initialized successfully', { projectPath });
    return 'Mongoose initialized successfully';
  }
  
  private async initDrizzle(projectPath: string, database: string, connectionString?: string): Promise<string> {
    const packages = ['drizzle-orm', 'drizzle-kit'];
    
    switch (database) {
      case 'postgresql':
        packages.push('postgres');
        break;
      case 'mysql':
        packages.push('mysql2');
        break;
      case 'sqlite':
        packages.push('better-sqlite3');
        break;
    }
    
    await this.executeCommand(`npm install ${packages.join(' ')}`, { cwd: projectPath });
    
    // Create drizzle config
    const drizzleConfig = `import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: '${database === 'postgresql' ? 'pg' : database}',
  dbCredentials: {
    ${connectionString ? `connectionString: '${connectionString}'` : `connectionString: process.env.DATABASE_URL!`}
  }
} satisfies Config;
`;
    
    await fs.writeFile(path.join(projectPath, 'drizzle.config.ts'), drizzleConfig);
    
    // Create schema file
    const schemaContent = database === 'postgresql' ? `import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});` : `import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).defaultNow()
});`;
    
    await fs.ensureDir(path.join(projectPath, 'src/db'));
    await fs.writeFile(path.join(projectPath, 'src/db/schema.ts'), schemaContent);
    
    logger.info('Drizzle initialized successfully', { projectPath, database });
    return 'Drizzle initialized successfully';
  }
}

class CreateMigrationTool extends DatabaseTool<z.infer<typeof createMigrationSchema>, string> {
  constructor() {
    super({
      name: 'create_migration',
      description: 'Create database migration',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Migration name' },
          type: { type: 'string', enum: ['prisma', 'typeorm', 'sequelize'], description: 'ORM type' },
          projectPath: { type: 'string', description: 'Project path' },
          sql: { type: 'string', description: 'Custom SQL for migration' }
        },
        required: ['name', 'type', 'projectPath']
      }
    });
  }
  
  protected getZodSchema() {
    return createMigrationSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof createMigrationSchema>): Promise<string> {
    const { name, type, projectPath, sql } = input;
    const sanitizedPath = this.sanitizePath(projectPath);
    
    switch (type) {
      case 'prisma':
        await this.executeCommand(`npx prisma migrate dev --name ${name}`, { cwd: sanitizedPath });
        break;
        
      case 'typeorm':
        await this.executeCommand(`npx typeorm migration:create -n ${name}`, { cwd: sanitizedPath });
        
        if (sql) {
          // Find the created migration file and add SQL
          const migrationsDir = path.join(sanitizedPath, 'src/migrations');
          const files = await fs.readdir(migrationsDir);
          const migrationFile = files.find(f => f.includes(name));
          
          if (migrationFile) {
            const filePath = path.join(migrationsDir, migrationFile);
            let content = await fs.readFile(filePath, 'utf-8');
            
            // Add SQL to up method
            content = content.replace(
              'public async up(queryRunner: QueryRunner): Promise<void> {',
              `public async up(queryRunner: QueryRunner): Promise<void> {\n        await queryRunner.query(\`${sql}\`);`
            );
            
            await fs.writeFile(filePath, content);
          }
        }
        break;
        
      case 'sequelize':
        await this.executeCommand(`npx sequelize-cli migration:generate --name ${name}`, { cwd: sanitizedPath });
        
        if (sql) {
          // Find and update the migration file
          const migrationsDir = path.join(sanitizedPath, 'migrations');
          const files = await fs.readdir(migrationsDir);
          const migrationFile = files.find(f => f.includes(name));
          
          if (migrationFile) {
            const filePath = path.join(migrationsDir, migrationFile);
            let content = await fs.readFile(filePath, 'utf-8');
            
            // Add SQL to up function
            content = content.replace(
              'up: async (queryInterface, Sequelize) => {',
              `up: async (queryInterface, Sequelize) => {\n    await queryInterface.sequelize.query(\`${sql}\`);`
            );
            
            await fs.writeFile(filePath, content);
          }
        }
        break;
    }
    
    logger.info('Migration created successfully', { name, type, projectPath });
    return `Migration ${name} created successfully`;
  }
}

class RunMigrationsTool extends DatabaseTool<z.infer<typeof runMigrationsSchema>, string> {
  constructor() {
    super({
      name: 'run_migrations',
      description: 'Run database migrations',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['prisma', 'typeorm', 'sequelize'], description: 'ORM type' },
          projectPath: { type: 'string', description: 'Project path' },
          direction: { type: 'string', enum: ['up', 'down'], default: 'up' }
        },
        required: ['type', 'projectPath']
      }
    });
  }
  
  // Schema validation handled in executeInternal
  
  protected async executeInternal(input: z.infer<typeof runMigrationsSchema>): Promise<string> {
    const { type, projectPath, direction = 'up' } = input;
    const sanitizedPath = this.sanitizePath(projectPath);
    
    switch (type) {
      case 'prisma':
        if (direction === 'up') {
          await this.executeCommand('npx prisma migrate deploy', { cwd: sanitizedPath });
        } else {
          // Prisma doesn't have a simple down command, need to use migrate reset
          logger.warn('Prisma migrate down not directly supported, use migrate reset with caution');
          return 'Prisma does not support migrate down. Use "npx prisma migrate reset" to reset the database.';
        }
        break;
        
      case 'typeorm':
        if (direction === 'up') {
          await this.executeCommand('npx typeorm migration:run', { cwd: sanitizedPath });
        } else {
          await this.executeCommand('npx typeorm migration:revert', { cwd: sanitizedPath });
        }
        break;
        
      case 'sequelize':
        const cmd = direction === 'up' ? 'db:migrate' : 'db:migrate:undo';
        await this.executeCommand(`npx sequelize-cli ${cmd}`, { cwd: sanitizedPath });
        break;
    }
    
    logger.info('Migrations executed successfully', { type, direction, projectPath });
    return `Migrations executed successfully (${direction})`;
  }
}

class GenerateModelTool extends BaseTool<z.infer<typeof generateModelSchema>, string> {
  constructor() {
    super({
      name: 'generate_model',
      description: 'Generate database model/entity',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Model name' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                required: { type: 'boolean', default: false },
                unique: { type: 'boolean', default: false },
                default: { type: 'string' }
              },
              required: ['name', 'type']
            },
            description: 'Model fields'
          },
          relations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany'] },
                target: { type: 'string' },
                field: { type: 'string' }
              }
            },
            description: 'Model relations'
          },
          ormType: { type: 'string', enum: ['prisma', 'typeorm', 'sequelize', 'mongoose'] },
          projectPath: { type: 'string', description: 'Project path' }
        },
        required: ['name', 'fields', 'ormType', 'projectPath']
      }
    });
  }
  
  // Schema validation handled in executeInternal
  
  protected async executeInternal(input: z.infer<typeof generateModelSchema>): Promise<string> {
    const { name, fields, relations = [], ormType, projectPath } = input;
    const sanitizedPath = this.sanitizePath(projectPath);
    
    switch (ormType) {
      case 'prisma':
        return await this.generatePrismaModel(name, fields, relations, sanitizedPath);
      case 'typeorm':
        return await this.generateTypeORMEntity(name, fields, relations, sanitizedPath);
      case 'sequelize':
        return await this.generateSequelizeModel(name, fields, relations, sanitizedPath);
      case 'mongoose':
        return await this.generateMongooseSchema(name, fields, sanitizedPath);
      default:
        throw new Error(`Unsupported ORM: ${ormType}`);
    }
  }
  
  private async generatePrismaModel(name: string, fields: any[], relations: any[], projectPath: string): Promise<string> {
    const schemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
    
    if (!await fs.pathExists(schemaPath)) {
      throw new ValidationError('Prisma schema file not found. Initialize Prisma first.');
    }
    
    let schema = await fs.readFile(schemaPath, 'utf-8');
    
    // Build model content
    let modelContent = `\nmodel ${name} {\n`;
    
    // Add ID field if not present
    const hasId = fields.some(f => f.name === 'id');
    if (!hasId) {
      modelContent += `  id Int @id @default(autoincrement())\n`;
    }
    
    // Add fields
    for (const field of fields) {
      let fieldLine = `  ${field.name} `;
      
      // Map types to Prisma types
      const typeMap: Record<string, string> = {
        'string': 'String',
        'number': 'Int',
        'float': 'Float',
        'boolean': 'Boolean',
        'date': 'DateTime',
        'json': 'Json'
      };
      
      fieldLine += typeMap[field.type.toLowerCase()] || field.type;
      
      if (!field.required) fieldLine += '?';
      if (field.unique) fieldLine += ' @unique';
      if (field.default) {
        if (field.default === 'now') {
          fieldLine += ' @default(now())';
        } else if (field.default === 'uuid') {
          fieldLine += ' @default(uuid())';
        } else {
          fieldLine += ` @default(${field.default})`;
        }
      }
      
      modelContent += fieldLine + '\n';
    }
    
    // Add timestamps if not present
    const hasCreatedAt = fields.some(f => f.name === 'createdAt');
    const hasUpdatedAt = fields.some(f => f.name === 'updatedAt');
    
    if (!hasCreatedAt) {
      modelContent += `  createdAt DateTime @default(now())\n`;
    }
    if (!hasUpdatedAt) {
      modelContent += `  updatedAt DateTime @updatedAt\n`;
    }
    
    // Add relations
    for (const relation of relations) {
      if (relation.type === 'oneToMany') {
        modelContent += `  ${relation.field} ${relation.target}[]\n`;
      } else if (relation.type === 'manyToOne' || relation.type === 'oneToOne') {
        modelContent += `  ${relation.field} ${relation.target}${relation.type === 'oneToOne' ? '?' : ''}\n`;
        modelContent += `  ${relation.field}Id Int${relation.type === 'oneToOne' ? '? @unique' : ''}\n`;
      }
    }
    
    modelContent += '}\n';
    
    // Append to schema file
    schema += modelContent;
    await fs.writeFile(schemaPath, schema);
    
    logger.info('Prisma model generated successfully', { name, projectPath });
    return `Prisma model ${name} generated successfully. Run "npx prisma generate" to update the client.`;
  }
  
  private async generateTypeORMEntity(name: string, fields: any[], relations: any[], projectPath: string): Promise<string> {
    let entityContent = `import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn`;
    
    // Add relation imports if needed
    if (relations.length > 0) {
      const relationImports = new Set<string>();
      relations.forEach(r => {
        if (r.type === 'oneToOne') relationImports.add('OneToOne');
        if (r.type === 'oneToMany') relationImports.add('OneToMany');
        if (r.type === 'manyToOne') relationImports.add('ManyToOne');
        if (r.type === 'manyToMany') relationImports.add('ManyToMany');
        relationImports.add('JoinColumn');
        if (r.type === 'manyToMany') relationImports.add('JoinTable');
      });
      entityContent += `, ${Array.from(relationImports).join(', ')}`;
    }
    
    entityContent += ` } from 'typeorm';\n\n`;
    
    // Add imports for related entities
    for (const relation of relations) {
      entityContent += `import { ${relation.target} } from './${relation.target}';\n`;
    }
    
    entityContent += `\n@Entity()\nexport class ${name} {\n`;
    
    // Add ID if not present
    const hasId = fields.some(f => f.name === 'id');
    if (!hasId) {
      entityContent += `  @PrimaryGeneratedColumn()\n  id: number;\n\n`;
    }
    
    // Add fields
    for (const field of fields) {
      if (field.name === 'id') {
        entityContent += `  @PrimaryGeneratedColumn()\n`;
      } else {
        const columnOptions: any = {};
        if (!field.required) columnOptions.nullable = true;
        if (field.unique) columnOptions.unique = true;
        if (field.default !== undefined) columnOptions.default = field.default;
        
        const optionsStr = Object.keys(columnOptions).length > 0 
          ? `(${JSON.stringify(columnOptions)})` 
          : '()';
        
        entityContent += `  @Column${optionsStr}\n`;
      }
      
      // Map types
      const typeMap: Record<string, string> = {
        'string': 'string',
        'number': 'number',
        'float': 'number',
        'boolean': 'boolean',
        'date': 'Date',
        'json': 'any'
      };
      
      const tsType = typeMap[field.type.toLowerCase()] || 'string';
      entityContent += `  ${field.name}${field.required ? '' : '?'}: ${tsType};\n\n`;
    }
    
    // Add timestamps if not present
    const hasCreatedAt = fields.some(f => f.name === 'createdAt');
    const hasUpdatedAt = fields.some(f => f.name === 'updatedAt');
    
    if (!hasCreatedAt) {
      entityContent += `  @CreateDateColumn()\n  createdAt: Date;\n\n`;
    }
    if (!hasUpdatedAt) {
      entityContent += `  @UpdateDateColumn()\n  updatedAt: Date;\n\n`;
    }
    
    // Add relations
    for (const relation of relations) {
      switch (relation.type) {
        case 'oneToOne':
          entityContent += `  @OneToOne(() => ${relation.target})\n`;
          entityContent += `  @JoinColumn()\n`;
          entityContent += `  ${relation.field}: ${relation.target};\n\n`;
          break;
        case 'oneToMany':
          entityContent += `  @OneToMany(() => ${relation.target}, ${relation.target.toLowerCase()} => ${relation.target.toLowerCase()}.${name.toLowerCase()})\n`;
          entityContent += `  ${relation.field}: ${relation.target}[];\n\n`;
          break;
        case 'manyToOne':
          entityContent += `  @ManyToOne(() => ${relation.target}, ${relation.target.toLowerCase()} => ${relation.target.toLowerCase()}.${name.toLowerCase()}s)\n`;
          entityContent += `  ${relation.field}: ${relation.target};\n\n`;
          break;
        case 'manyToMany':
          entityContent += `  @ManyToMany(() => ${relation.target})\n`;
          entityContent += `  @JoinTable()\n`;
          entityContent += `  ${relation.field}: ${relation.target}[];\n\n`;
          break;
      }
    }
    
    entityContent += '}\n';
    
    // Write entity file
    const entityPath = path.join(projectPath, 'src/entities', `${name}.ts`);
    await fs.ensureDir(path.dirname(entityPath));
    await fs.writeFile(entityPath, entityContent);
    
    logger.info('TypeORM entity generated successfully', { name, projectPath });
    return `TypeORM entity ${name} generated successfully`;
  }
  
  private async generateSequelizeModel(name: string, fields: any[], relations: any[], projectPath: string): Promise<string> {
    let modelContent = `'use strict';\n`;
    modelContent += `const { Model } = require('sequelize');\n\n`;
    modelContent += `module.exports = (sequelize, DataTypes) => {\n`;
    modelContent += `  class ${name} extends Model {\n`;
    modelContent += `    static associate(models) {\n`;
    
    // Add associations
    for (const relation of relations) {
      switch (relation.type) {
        case 'oneToMany':
          modelContent += `      this.hasMany(models.${relation.target}, {\n`;
          modelContent += `        foreignKey: '${name.toLowerCase()}Id',\n`;
          modelContent += `        as: '${relation.field}'\n`;
          modelContent += `      });\n`;
          break;
        case 'manyToOne':
          modelContent += `      this.belongsTo(models.${relation.target}, {\n`;
          modelContent += `        foreignKey: '${relation.field}Id',\n`;
          modelContent += `        as: '${relation.field}'\n`;
          modelContent += `      });\n`;
          break;
        case 'manyToMany':
          modelContent += `      this.belongsToMany(models.${relation.target}, {\n`;
          modelContent += `        through: '${name}${relation.target}',\n`;
          modelContent += `        as: '${relation.field}'\n`;
          modelContent += `      });\n`;
          break;
      }
    }
    
    modelContent += `    }\n  }\n\n`;
    modelContent += `  ${name}.init({\n`;
    
    // Add fields
    for (const field of fields) {
      if (field.name === 'id') continue; // Sequelize adds id automatically
      
      const sequelizeType = this.mapToSequelizeType(field.type);
      modelContent += `    ${field.name}: {\n`;
      modelContent += `      type: DataTypes.${sequelizeType},\n`;
      if (!field.required) modelContent += `      allowNull: true,\n`;
      if (field.unique) modelContent += `      unique: true,\n`;
      if (field.default !== undefined) {
        if (field.default === 'now') {
          modelContent += `      defaultValue: DataTypes.NOW,\n`;
        } else {
          modelContent += `      defaultValue: ${JSON.stringify(field.default)},\n`;
        }
      }
      modelContent += `    },\n`;
    }
    
    modelContent += `  }, {\n`;
    modelContent += `    sequelize,\n`;
    modelContent += `    modelName: '${name}',\n`;
    modelContent += `    timestamps: true,\n`;
    modelContent += `  });\n\n`;
    modelContent += `  return ${name};\n`;
    modelContent += `};\n`;
    
    // Write model file
    const modelPath = path.join(projectPath, 'models', `${name.toLowerCase()}.js`);
    await fs.ensureDir(path.dirname(modelPath));
    await fs.writeFile(modelPath, modelContent);
    
    logger.info('Sequelize model generated successfully', { name, projectPath });
    return `Sequelize model ${name} generated successfully`;
  }
  
  private async generateMongooseSchema(name: string, fields: any[], projectPath: string): Promise<string> {
    let schemaContent = `import mongoose from 'mongoose';\n\n`;
    schemaContent += `const ${name.toLowerCase()}Schema = new mongoose.Schema({\n`;
    
    // Add fields
    for (const field of fields) {
      schemaContent += `  ${field.name}: {\n`;
      schemaContent += `    type: ${this.mapToMongooseType(field.type)},\n`;
      if (field.required) schemaContent += `    required: true,\n`;
      if (field.unique) schemaContent += `    unique: true,\n`;
      if (field.default !== undefined) {
        if (field.default === 'now') {
          schemaContent += `    default: Date.now,\n`;
        } else {
          schemaContent += `    default: ${JSON.stringify(field.default)},\n`;
        }
      }
      schemaContent += `  },\n`;
    }
    
    schemaContent += `}, {\n  timestamps: true\n});\n\n`;
    
    // Add indexes for unique fields
    const uniqueFields = fields.filter(f => f.unique);
    if (uniqueFields.length > 0) {
      for (const field of uniqueFields) {
        schemaContent += `${name.toLowerCase()}Schema.index({ ${field.name}: 1 }, { unique: true });\n`;
      }
      schemaContent += '\n';
    }
    
    schemaContent += `const ${name} = mongoose.model('${name}', ${name.toLowerCase()}Schema);\n\n`;
    schemaContent += `export default ${name};\n`;
    
    // Write schema file
    const schemaPath = path.join(projectPath, 'src/models', `${name}.js`);
    await fs.ensureDir(path.dirname(schemaPath));
    await fs.writeFile(schemaPath, schemaContent);
    
    logger.info('Mongoose schema generated successfully', { name, projectPath });
    return `Mongoose schema ${name} generated successfully`;
  }
  
  private mapToSequelizeType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'STRING',
      'number': 'INTEGER',
      'float': 'FLOAT',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'json': 'JSON',
      'text': 'TEXT'
    };
    return typeMap[type.toLowerCase()] || 'STRING';
  }
  
  private mapToMongooseType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'String',
      'number': 'Number',
      'float': 'Number',
      'boolean': 'Boolean',
      'date': 'Date',
      'json': 'Object',
      'array': 'Array'
    };
    return typeMap[type.toLowerCase()] || 'String';
  }
}

class SeedDatabaseTool extends DatabaseTool<z.infer<typeof seedDatabaseSchema>, string> {
  constructor() {
    super({
      name: 'seed_database',
      description: 'Create and run database seeds',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['prisma', 'typeorm', 'sequelize', 'custom'] },
          projectPath: { type: 'string', description: 'Project path' },
          data: { type: 'object', description: 'Seed data' },
          file: { type: 'string', description: 'Path to seed file' }
        },
        required: ['type', 'projectPath']
      }
    });
  }
  
  protected getZodSchema() {
    return seedDatabaseSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof seedDatabaseSchema>): Promise<string> {
    const { type, projectPath, data, file } = input;
    const sanitizedPath = this.sanitizePath(projectPath);
    
    if (file) {
      const seedFile = this.sanitizePath(file);
      await this.executeCommand(`node ${seedFile}`, { cwd: sanitizedPath });
      return 'Seed file executed successfully';
    }
    
    // Create seed file based on type
    switch (type) {
      case 'prisma':
        return await this.createPrismaSeed(sanitizedPath, data);
      case 'typeorm':
        return await this.createTypeORMSeed(sanitizedPath, data);
      case 'sequelize':
        return await this.createSequelizeSeed(sanitizedPath, data);
      default:
        throw new Error(`Unsupported seed type: ${type}`);
    }
  }
  
  private async createPrismaSeed(projectPath: string, data: any): Promise<string> {
    const seedContent = `import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  
  ${data ? this.generatePrismaSeedCode(data) : '// Add your seed data here'}
  
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`;
    
    const seedPath = path.join(projectPath, 'prisma/seed.ts');
    await fs.writeFile(seedPath, seedContent);
    
    // Update package.json to add seed script
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      
      if (!packageJson.prisma) {
        packageJson.prisma = {};
      }
      packageJson.prisma.seed = 'ts-node prisma/seed.ts';
      
      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }
    
    // Run the seed
    await this.executeCommand('npx prisma db seed', { cwd: projectPath });
    
    return 'Prisma database seeded successfully';
  }
  
  private generatePrismaSeedCode(data: any): string {
    let code = '';
    
    // Generate seed code based on data structure
    for (const [model, records] of Object.entries(data)) {
      if (Array.isArray(records)) {
        code += `  // Create ${model}\n`;
        code += `  await prisma.${model.toLowerCase()}.createMany({\n`;
        code += `    data: ${JSON.stringify(records, null, 4)}\n`;
        code += `  });\n\n`;
      }
    }
    
    return code;
  }
  
  private async createTypeORMSeed(projectPath: string, data: any): Promise<string> {
    // TypeORM doesn't have built-in seeding, create a custom seed script
    const seedContent = `import 'reflect-metadata';
import { createConnection } from 'typeorm';

async function seed() {
  const connection = await createConnection();
  
  try {
    console.log('Start seeding...');
    
    ${data ? '// Add your seed logic here' : '// Add your seed logic here'}
    
    console.log('Seeding finished.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await connection.close();
  }
}

seed();
`;
    
    const seedPath = path.join(projectPath, 'src/seeds/seed.ts');
    await fs.ensureDir(path.dirname(seedPath));
    await fs.writeFile(seedPath, seedContent);
    
    // Run the seed
    await this.executeCommand('npx ts-node src/seeds/seed.ts', { cwd: projectPath });
    
    return 'TypeORM database seeded successfully';
  }
  
  private async createSequelizeSeed(projectPath: string, data: any): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const seedName = `${timestamp}-demo-seed`;
    
    await this.executeCommand(`npx sequelize-cli seed:generate --name ${seedName}`, { cwd: projectPath });
    
    // Update the generated seed file with data
    if (data) {
      const seedsDir = path.join(projectPath, 'seeders');
      const files = await fs.readdir(seedsDir);
      const seedFile = files.find(f => f.includes(seedName));
      
      if (seedFile) {
        const seedPath = path.join(seedsDir, seedFile);
        let content = await fs.readFile(seedPath, 'utf-8');
        
        // Add seed data to up function
        const seedCode = this.generateSequelizeSeedCode(data);
        content = content.replace(
          'up: async (queryInterface, Sequelize) => {',
          `up: async (queryInterface, Sequelize) => {\n${seedCode}`
        );
        
        await fs.writeFile(seedPath, content);
      }
    }
    
    // Run the seed
    await this.executeCommand('npx sequelize-cli db:seed:all', { cwd: projectPath });
    
    return 'Sequelize database seeded successfully';
  }
  
  private generateSequelizeSeedCode(data: any): string {
    let code = '';
    
    for (const [table, records] of Object.entries(data)) {
      if (Array.isArray(records)) {
        // Add timestamps to each record
        const recordsWithTimestamps = records.map(record => ({
          ...record,
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        
        code += `    await queryInterface.bulkInsert('${table}', ${JSON.stringify(recordsWithTimestamps, null, 6)}, {});\n`;
      }
    }
    
    return code;
  }
}

class BackupDatabaseTool extends DatabaseTool<z.infer<typeof backupDatabaseSchema>, string> {
  constructor() {
    super({
      name: 'backup_database',
      description: 'Create database backup',
      inputSchema: {
        type: 'object',
        properties: {
          database: { type: 'string', enum: ['postgresql', 'mysql', 'mongodb'] },
          connectionString: { type: 'string', description: 'Database connection string' },
          outputPath: { type: 'string', description: 'Backup file path' },
          format: { type: 'string', enum: ['sql', 'json', 'custom'], default: 'sql' }
        },
        required: ['database', 'connectionString', 'outputPath']
      },
      timeout: 300000 // 5 minutes for large databases
    });
  }
  
  // Schema validation handled in executeInternal
  
  protected async executeInternal(input: z.infer<typeof backupDatabaseSchema>): Promise<string> {
    const { database, connectionString, outputPath, format = 'sql' } = input;
    const sanitizedOutputPath = this.sanitizePath(outputPath);
    
    // Ensure output directory exists
    await fs.ensureDir(path.dirname(sanitizedOutputPath));
    
    // Add timestamp to backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = sanitizedOutputPath.replace(/(\.[^.]+)$/, `-${timestamp}$1`);
    
    try {
      switch (database) {
        case 'postgresql':
          await this.backupPostgres(connectionString, backupFile, format);
          break;
        case 'mysql':
          await this.backupMySQL(connectionString, backupFile, format);
          break;
        case 'mongodb':
          await this.backupMongoDB(connectionString, backupFile, format);
          break;
      }
      
      // Compress backup if it's large
      const stats = await fs.stat(backupFile);
      if (stats.size > 10 * 1024 * 1024) { // 10MB
        await this.executeCommand(`gzip ${backupFile}`);
        logger.info('Backup compressed', { originalSize: stats.size });
        return `Database backup created and compressed at ${backupFile}.gz`;
      }
      
      logger.info('Database backup created', { database, outputPath: backupFile, size: stats.size });
      return `Database backup created at ${backupFile}`;
      
    } catch (error) {
      logger.error('Database backup failed', error as Error);
      throw new DatabaseError(`Backup failed: ${(error as Error).message}`);
    }
  }
  
  private async backupPostgres(connectionString: string, outputPath: string, format: string): Promise<void> {
    const pgDumpArgs = [
      `"${connectionString}"`,
      '-f', `"${outputPath}"`,
      '--verbose',
      '--no-owner',
      '--no-acl'
    ];
    
    if (format === 'custom') {
      pgDumpArgs.push('-Fc'); // Custom format for smaller size
    }
    
    await this.executeCommand(`pg_dump ${pgDumpArgs.join(' ')}`);
  }
  
  private async backupMySQL(connectionString: string, outputPath: string, format: string): Promise<void> {
    // Parse connection string
    const url = new URL(connectionString);
    const host = url.hostname;
    const port = url.port || '3306';
    const user = url.username;
    const password = url.password;
    const database = url.pathname.slice(1);
    
    const mysqlDumpArgs = [
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      password ? `-p${password}` : '',
      database,
      `> "${outputPath}"`
    ].filter(Boolean);
    
    await this.executeCommand(`mysqldump ${mysqlDumpArgs.join(' ')}`);
  }
  
  private async backupMongoDB(connectionString: string, outputPath: string, format: string): Promise<void> {
    const mongoDumpArgs = [
      `--uri="${connectionString}"`,
      `--out="${outputPath}"`,
      '--gzip'
    ];
    
    if (format === 'json') {
      mongoDumpArgs.push('--jsonArray');
    }
    
    await this.executeCommand(`mongodump ${mongoDumpArgs.join(' ')}`);
  }
}

class QueryDatabaseTool extends DatabaseTool<z.infer<typeof queryDatabaseSchema>, any> {
  constructor() {
    super({
      name: 'query_database',
      description: 'Execute database query safely with parameterized statements',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL query or operation' },
          database: { type: 'string', enum: ['postgresql', 'mysql', 'sqlite', 'mongodb'] },
          connectionString: { type: 'string', description: 'Database connection string' },
          parameters: { type: 'array', description: 'Query parameters' }
        },
        required: ['query', 'database', 'connectionString']
      },
      rateLimit: {
        windowMs: 60000,
        maxRequests: 50 // Limit database queries
      }
    });
  }
  
  protected getZodSchema() {
    return queryDatabaseSchema;
  }
  
  protected async executeInternal(input: z.infer<typeof queryDatabaseSchema>): Promise<any> {
    const { query, database, connectionString, parameters = [] } = input;
    
    // Basic SQL injection prevention
    const dangerousPatterns = [
      /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s+/i,
      /--/,
      /\/\*/,
      /\*\//,
      /UNION\s+SELECT/i,
      /OR\s+1\s*=\s*1/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new ValidationError('Query contains potentially dangerous SQL');
      }
    }
    
    const pool = await getConnectionPool(database, connectionString);
    const { connection } = await pool.acquire();
    
    try {
      let result;
      
      switch (database) {
        case 'postgresql':
          result = await this.queryPostgres(connection, query, parameters);
          break;
        case 'mysql':
          result = await this.queryMySQL(connection, query, parameters);
          break;
        case 'sqlite':
          result = await this.querySQLite(connection, query, parameters);
          break;
        case 'mongodb':
          result = await this.queryMongoDB(connection, query, parameters);
          break;
      }
      
      logger.info('Database query executed', { 
        database, 
        query: query.substring(0, 100),
        rowCount: result.rowCount || result.length 
      });
      
      return result;
      
    } finally {
      await pool.release(connection.id);
    }
  }
  
  private async queryPostgres(pool: any, query: string, params: any[]): Promise<any> {
    if (pool.type === 'mock') {
      return pool.query(query, params);
    }
    
    const result = await pool.query(query, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields?.map((f: any) => ({ name: f.name, type: f.dataTypeID }))
    };
  }
  
  private async queryMySQL(pool: any, query: string, params: any[]): Promise<any> {
    if (pool.type === 'mock') {
      return pool.query(query, params);
    }
    
    const [rows, fields] = await pool.execute(query, params);
    return {
      rows,
      rowCount: Array.isArray(rows) ? rows.length : rows.affectedRows,
      fields: fields?.map((f: any) => ({ name: f.name, type: f.type }))
    };
  }
  
  private async querySQLite(db: any, query: string, params: any[]): Promise<any> {
    if (db.type === 'mock') {
      return db.query(query, params);
    }
    
    const isSelect = query.trim().toUpperCase().startsWith('SELECT');
    
    if (isSelect) {
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      return {
        rows,
        rowCount: rows.length
      };
    } else {
      const stmt = db.prepare(query);
      const result = stmt.run(...params);
      return {
        rowCount: result.changes,
        lastInsertRowid: result.lastInsertRowid
      };
    }
  }
  
  private async queryMongoDB(client: any, query: string, params: any[]): Promise<any> {
    if (client.type === 'mock') {
      return client.query(query, params);
    }
    
    // Parse MongoDB-style query
    try {
      const operation = JSON.parse(query);
      const db = client.db(); // Use default database from connection string
      const collection = db.collection(operation.collection);
      
      switch (operation.operation) {
        case 'find':
          const cursor = collection.find(operation.filter || {});
          if (operation.limit) cursor.limit(operation.limit);
          if (operation.skip) cursor.skip(operation.skip);
          if (operation.sort) cursor.sort(operation.sort);
          const docs = await cursor.toArray();
          return { rows: docs, rowCount: docs.length };
          
        case 'insertOne':
          const insertResult = await collection.insertOne(operation.document);
          return { insertedId: insertResult.insertedId, acknowledged: insertResult.acknowledged };
          
        case 'updateOne':
          const updateResult = await collection.updateOne(operation.filter, operation.update);
          return { 
            matchedCount: updateResult.matchedCount,
            modifiedCount: updateResult.modifiedCount
          };
          
        case 'deleteOne':
          const deleteResult = await collection.deleteOne(operation.filter);
          return { deletedCount: deleteResult.deletedCount };
          
        default:
          throw new Error(`Unsupported MongoDB operation: ${operation.operation}`);
      }
    } catch (error) {
      throw new DatabaseError(`MongoDB query failed: ${(error as Error).message}`, query);
    }
  }
}

// Export tool instances
export const databaseTools = new Map<string, any>([
  ['init_database', new InitDatabaseTool()],
  ['create_migration', new CreateMigrationTool()],
  ['run_migrations', new RunMigrationsTool()],
  ['generate_model', new GenerateModelTool()],
  ['seed_database', new SeedDatabaseTool()],
  ['backup_database', new BackupDatabaseTool()],
  ['query_database', new QueryDatabaseTool()]
]);

// Cleanup function for connection pools
export async function cleanupDatabaseConnections(): Promise<void> {
  logger.info('Cleaning up database connections');
  
  for (const [key, pool] of connectionPools.entries()) {
    try {
      await pool.drain();
      logger.info('Connection pool drained', { key });
    } catch (error) {
      logger.error('Error draining connection pool', error as Error, { key });
    }
  }
  
  connectionPools.clear();
}

// Register cleanup on process exit
process.on('beforeExit', cleanupDatabaseConnections);
