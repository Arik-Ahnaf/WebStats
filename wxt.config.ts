import { defineConfig } from 'wxt';
import { permissionPolicy } from './src/shared/permission-policy';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  zip: {
    zipSources: true,
    sourcesTemplate: 'webstats-sources.zip',
    includeSources: ['entrypoints/**', 'src/**', 'public/**', 'tests/**', 'scripts/**',
      'package.json', 'package-lock.json', '*.ts', 'tsconfig.json', 'eslint.config.js', 'README.md', 'AGENTS.md'],
  },
  vite: () => ({ resolve: { alias: {
    // Use the vendor's ESM build; its legacy UMD build contains a Function fallback.
    'decimal.js-light': 'decimal.js-light/decimal.mjs',
  } } }),
  manifest: ({ browser, mode }) => ({
    name: 'WebStats',
    description: 'Keep track of your online presence. Private website time reports, stored only on your device.',
    permissions: permissionPolicy(browser).required,
    optional_permissions: permissionPolicy(browser).optional,
    incognito: 'not_allowed',
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    ...(browser === 'chrome' ? { minimum_chrome_version: '120' } : {}),
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'webstats@webstats.local',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    } : {}),
    ...(mode === 'production' ? { content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'",
    } } : {}),
  }),
});
