process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/zupu_test';
process.env.UPLOAD_DIR = require('node:path').join(require('node:os').tmpdir(), 'zupu-test-uploads');
