import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// ESLint 9 flat config. Next.js 16 removed `next lint` and the legacy
// .eslintrc format, so `npm run lint` now calls the ESLint CLI directly.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    rules: {
      // New in eslint-plugin-react-hooks v7 (shipped with eslint-config-next
      // 16). Existing reset-on-open / mounted-flag effects are intentional;
      // kept visible as warnings rather than failing the lint run.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
