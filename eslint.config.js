import createConfig from '@cogs/eslint-config';

export default [
  ...createConfig({
    tsconfigRootDir: import.meta.dirname,
    tsProjects: ['./tsconfig.json'],
  }),
];
