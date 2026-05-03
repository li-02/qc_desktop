/** @type {import("jest").Config} */
module.exports = {
  rootDir: "..",
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/electron/**/*.spec.ts"],
  modulePathIgnorePatterns: ["<rootDir>/R-Portable", "<rootDir>/dist", "<rootDir>/frontend/dist"],
  testPathIgnorePatterns: ["<rootDir>/node_modules", "<rootDir>/R-Portable", "<rootDir>/dist"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/shared/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/electron/tsconfig.json",
        diagnostics: false,
      },
    ],
  },
  clearMocks: true,
};
