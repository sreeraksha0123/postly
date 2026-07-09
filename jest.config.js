module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@postly/shared$": "<rootDir>/packages/shared/src",
    "^@postly/agents$": "<rootDir>/packages/agents/src",
    "^@postly/rag$": "<rootDir>/packages/rag/src",
    "^@postly/queues$": "<rootDir>/packages/queues/src",
    "^@postly/integrations$": "<rootDir>/packages/integrations/src",
  },
  testTimeout: 20000,
};
