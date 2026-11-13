import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const tests=(await fs.readdir('tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
execFileSync(process.execPath,['--test',...tests],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
