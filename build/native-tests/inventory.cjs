'use strict';
// Public package metadata only. No source/config/environment contents are read.
const fs = require('node:fs');
const path = require('node:path');
const packages = [];
function visit(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    const target = path.join(directory, item.name);
    if (item.isDirectory()) visit(target);
    else if (item.name === 'package.json') {
      const pkg = JSON.parse(fs.readFileSync(target));
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
        packages.push({ name: pkg.name, version: pkg.version, path: path.relative('/app', target),
          license: typeof pkg.license === 'string' ? pkg.license : null });
      }
    }
  }
}
visit('/app/node_modules');
packages.sort((a, b) => a.path.localeCompare(b.path));
process.stdout.write(JSON.stringify({ format: 'noovicrew-private-node-package-inventory-v1', packages }) + '\n');
