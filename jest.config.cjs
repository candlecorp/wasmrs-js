const path = require('path');
const { defaultsESM: tsjPreset } = require('ts-jest/presets');

const esModules = ['src/rsocket-core/'].join('|');

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestOptions = {
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },

  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
};

module.exports = jestOptions;
