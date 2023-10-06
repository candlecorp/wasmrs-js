import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export function genConfig(type) {
  return {
    input: `src/${type}/worker/worker-entry.ts`,
    output: [
      {
        file: `dist/worker-${type}.js`,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: `dist/worker-${type}.esm.js`,
        format: 'esm',
        sourcemap: true,
      },
    ],

    plugins: [
      typescript({
        tsconfig: `./src/${type}/worker/tsconfig.json`,
        typeRoots: ['./node_modules/@types', './types'],
      }),
      nodeResolve({
        browser: true,
      }),
      commonjs(),
    ],
  };
}

export default genConfig('browser');
