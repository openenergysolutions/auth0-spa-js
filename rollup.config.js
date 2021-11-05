import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import sourcemaps from 'rollup-plugin-sourcemaps';
import livereload from 'rollup-plugin-livereload';
import visualizer from 'rollup-plugin-visualizer';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';
import replace from '@rollup/plugin-replace';
import analyze from 'rollup-plugin-analyzer';
import dev from 'rollup-plugin-dev';
import { createApp } from './scripts/oidc-provider';

import pkg from './package.json';

const EXPORT_NAME = 'createAuth0Client';

const isProduction = process.env.NODE_ENV === 'production';
const shouldGenerateStats = process.env.WITH_STATS === 'true';
const defaultDevPort = 3000;
const serverPort = process.env.DEV_PORT || defaultDevPort;

const visualizerOptions = {
  filename: 'bundle-stats/index.html'
};

const getPlugins = opts => {
  return [
    webWorkerLoader({
      targetPlatform: 'browser',
      sourceMap: !isProduction,
      preserveSource: !isProduction,
      pattern: /^(?!(?:[a-zA-Z]:)|\/).+\.worker\.ts$/
    }),
    resolve({
      browser: true
    }),
    commonjs(),
    typescript({
      clean: true,
      useTsconfigDeclarationDir: true,
      tsconfigOverride: {
        noEmit: false,
        sourceMap: true,
        compilerOptions: {
          lib: ['dom', 'es6']
        },
        ...opts.tsConfig
      }
    }),
    replace({ 'process.env.NODE_ENV': `'${process.env.NODE_ENV}'` }),
    opts.minify && terser(),
    sourcemaps()
  ];
};

const getStatsPlugins = () => {
  if (!shouldGenerateStats) return [];
  return [visualizer(visualizerOptions), analyze({ summaryOnly: true })];
};

const footer = `('Auth0Client' in this) && this.console && this.console.warn && this.console.warn('Auth0Client already declared on the global namespace');
this && this.${EXPORT_NAME} && (this.Auth0Client = this.Auth0Client || this.${EXPORT_NAME}.Auth0Client);`;

let bundles = [
  {
    input: 'src/index.cjs.ts',
    output: {
      name: EXPORT_NAME,
      file: 'dist/auth0-spa-js.development.js',
      footer,
      format: 'umd',
      sourcemap: true
    },
    plugins: [
      ...getPlugins({ minify: false }),
      !isProduction &&
        dev({
          dirs: ['dist', 'static'],
          port: serverPort,
          extend(app, modules) {
            app.use(modules.mount(createApp({ port: serverPort })));
          }
        }),
      !isProduction && livereload()
    ],
    watch: {
      clearScreen: false
    }
  }
];

if (isProduction) {
  bundles = bundles.concat(
    {
      input: 'src/index.cjs.ts',
      output: [
        {
          name: EXPORT_NAME,
          file: 'dist/auth0-spa-js.production.js',
          footer,
          format: 'umd'
        }
      ],
      plugins: [...getPlugins({ minify: isProduction }), ...getStatsPlugins()]
    },
    {
      input: 'src/index.ts',
      output: [
        {
          file: pkg.module,
          format: 'esm'
        }
      ],
      plugins: getPlugins({ minify: isProduction })
    },
    {
      input: 'src/index.cjs.ts',
      output: [
        {
          name: EXPORT_NAME,
          file: pkg.main,
          format: 'cjs'
        }
      ],
      plugins: getPlugins({ minify: false }),
      external: Object.keys(pkg.dependencies)
    },
    {
      input: 'src/index.base.ts',
      output: [
        {
          file: 'dist/auth0-spa-js.modern.esm.js',
          format: 'esm'
        }
      ],
      plugins: getPlugins({
        minify: isProduction,
        tsConfig: {
          compilerOptions: {
            target: 'es6'
          }
        }
      })
    }
  );
}
export default bundles;
