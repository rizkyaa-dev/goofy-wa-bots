const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (!fs.existsSync(envPath)) {
    return 'file:./dev.db';
  }

  const env = fs.readFileSync(envPath, 'utf8');
  const line = env
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith('DATABASE_URL='));

  if (!line) {
    return 'file:./dev.db';
  }

  return line
    .slice('DATABASE_URL='.length)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) {
    return null;
  }

  const sqlitePath = databaseUrl.slice('file:'.length);

  if (path.isAbsolute(sqlitePath)) {
    return sqlitePath;
  }

  return path.resolve(projectRoot, 'prisma', sqlitePath);
}

const sqlitePath = resolveSqlitePath(readDatabaseUrl());

if (!sqlitePath) {
  process.exit(0);
}

fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

if (!fs.existsSync(sqlitePath)) {
  fs.closeSync(fs.openSync(sqlitePath, 'w'));
}
