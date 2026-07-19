const { readdirSync } = require('fs');
const { join, resolve } = require('path');
const { spawnSync } = require('child_process');

const root = resolve(process.argv[2] || 'dist-test');

function collectTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = collectTestFiles(root);

if (files.length === 0) {
  console.error(`No test files found in ${root}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
