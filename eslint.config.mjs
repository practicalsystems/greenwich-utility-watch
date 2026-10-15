// ESLint flat config. Next.js 16 removed `next lint`; run `npm run lint` (eslint .).
// Docs: https://nextjs.org/docs/app/api-reference/config/eslint
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      // eslint-config-next defaults to `version: 'detect'`. Under ESLint 10,
      // eslint-plugin-react's detection calls the removed context.getFilename()
      // and crashes ("contextOrFilename.getFilename is not a function").
      // Pin to the React major from package.json; bump it when React is upgraded.
      react: { version: '18.3' },
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),
])
