module.exports = {
  preset: "jest-expo",
  clearMocks: true,
  testMatch: ["**/__tests__/**/*.test.js"],
  setupFiles: [
    "<rootDir>/node_modules/@react-native-google-signin/google-signin/jest/build/jest/setup.js",
  ],
};
