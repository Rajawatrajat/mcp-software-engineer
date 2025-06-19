import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

export const testingTools = new Map([
  [
    'setup_testing',
    {
      name: 'setup_testing',
      description: 'Setup testing framework and configuration',
      inputSchema: {
        type: 'object',
        properties: {
          framework: { 
            type: 'string',
            enum: ['jest', 'vitest', 'mocha', 'pytest', 'junit'],
            description: 'Testing framework'
          },
          projectPath: { type: 'string', description: 'Project path' },
          testTypes: {
            type: 'array',
            items: { type: 'string', enum: ['unit', 'integration', 'e2e'] },
            description: 'Types of tests to setup'
          }
        },
        required: ['framework', 'projectPath']
      },
      async execute(args: any) {
        const { framework, projectPath, testTypes = ['unit'] } = args;
        
        switch (framework) {
          case 'jest':
            await execAsync(`cd "${projectPath}" && npm install --save-dev jest @types/jest`);
            
            const jestConfig = {
              preset: 'ts-jest',
              testEnvironment: 'node',
              collectCoverage: true,
              coverageDirectory: 'coverage',
              testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts']
            };
            
            await fs.writeJson(path.join(projectPath, 'jest.config.json'), jestConfig, { spaces: 2 });
            break;
            
          case 'vitest':
            await execAsync(`cd "${projectPath}" && npm install --save-dev vitest`);
            break;
            
          case 'pytest':
            await execAsync(`cd "${projectPath}" && pip install pytest pytest-cov`);
            
            const pytestConfig = `[tool:pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = --cov=src --cov-report=html`;
            
            await fs.writeFile(path.join(projectPath, 'pytest.ini'), pytestConfig);
            break;
        }
        
        // Create test directories
        for (const testType of testTypes) {
          await fs.ensureDir(path.join(projectPath, 'tests', testType));
        }
        
        return `${framework} testing setup completed with ${testTypes.join(', ')} tests`;
      }
    }
  ],
  [
    'create_test',
    {
      name: 'create_test',
      description: 'Create test file for specific component/function',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Test name' },
          type: { type: 'string', enum: ['unit', 'integration', 'e2e'] },
          framework: { type: 'string', enum: ['jest', 'vitest', 'pytest'] },
          projectPath: { type: 'string', description: 'Project path' },
          targetFile: { type: 'string', description: 'File to test' }
        },
        required: ['name', 'type', 'framework', 'projectPath']
      },
      async execute(args: any) {
        const { name, type, framework, projectPath, targetFile } = args;
        
        let testContent = '';
        
        switch (framework) {
          case 'jest':
            testContent = `import { ${name} } from '${targetFile || `../${name}`}';

describe('${name}', () => {
  test('should work correctly', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = ${name}(input);
    
    // Assert
    expect(result).toBeDefined();
  });
  
  test('should handle edge cases', () => {
    // Add edge case tests here
    expect(true).toBe(true);
  });
});`;
            break;
            
          case 'pytest':
            testContent = `import pytest
from src.${name.toLowerCase()} import ${name}

class Test${name}:
    def test_${name.toLowerCase()}_works_correctly(self):
        # Arrange
        input_data = "test"
        
        # Act
        result = ${name}(input_data)
        
        # Assert
        assert result is not None
        
    def test_${name.toLowerCase()}_handles_edge_cases(self):
        # Add edge case tests here
        assert True`;
            break;
        }
        
        const extension = framework === 'pytest' ? 'py' : 'test.ts';
        const testPath = path.join(projectPath, 'tests', type, `${name.toLowerCase()}.${extension}`);
        
        await fs.ensureDir(path.dirname(testPath));
        await fs.writeFile(testPath, testContent);
        
        return `${type} test created for ${name}`;
      }
    }
  ],
  [
    'run_tests',
    {
      name: 'run_tests',
      description: 'Run tests with specified configuration',
      inputSchema: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['jest', 'vitest', 'pytest'] },
          projectPath: { type: 'string', description: 'Project path' },
          type: { type: 'string', enum: ['unit', 'integration', 'e2e', 'all'] },
          coverage: { type: 'boolean', default: false },
          watch: { type: 'boolean', default: false }
        },
        required: ['framework', 'projectPath']
      },
      async execute(args: any) {
        const { framework, projectPath, type = 'all', coverage = false, watch = false } = args;
        
        let command = '';
        
        switch (framework) {
          case 'jest':
            command = `cd "${projectPath}" && npx jest`;
            if (coverage) command += ' --coverage';
            if (watch) command += ' --watch';
            if (type !== 'all') command += ` --testPathPattern=${type}`;
            break;
            
          case 'vitest':
            command = `cd "${projectPath}" && npx vitest`;
            if (coverage) command += ' --coverage';
            if (watch) command += ' --watch';
            break;
            
          case 'pytest':
            command = `cd "${projectPath}" && python -m pytest`;
            if (coverage) command += ' --cov=src';
            if (type !== 'all') command += ` tests/${type}`;
            break;
        }
        
        const { stdout, stderr } = await execAsync(command);
        
        return {
          success: true,
          output: stdout,
          errors: stderr
        };
      }
    }
  ]
]);
