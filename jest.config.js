/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  watchPlugins: ['jest-runner-eslint/watch-fix'],
  projects: [
    {
      displayName: 'test',
      preset: 'ts-jest',
      testEnvironment: 'node',
    },
    {
      runner: 'jest-runner-eslint',
      displayName: 'lint',
      testMatch: [
        '<rootDir>/src/**/*.ts',
        '<rootDir>/tests/**/*.ts',
        '<rootDir>/e2e/**/*.ts',
      ],
    },
  ],
};
