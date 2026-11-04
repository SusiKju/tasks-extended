// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'functions/*', 'public/*', 'kinder/*', 'scripts/*', '*.gs', 'node_modules/*'],
  },
  {
    rules: {
      // Regeln für den React Compiler – der ist in diesem Projekt nicht aktiv.
      // Als Warnung sichtbar, blockieren aber die CI nicht.
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      // Web-Regel (HTML-Entities); in React-Native-<Text> sind ' und " harmlos.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
