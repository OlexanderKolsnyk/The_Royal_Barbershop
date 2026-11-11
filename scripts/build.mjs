import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});
const initial=JSON.parse(await fs.readFile('shared/initial.json','utf8'));
const scope={Intl,Date,module:{exports:{}}};vm.runInNewContext(await fs.readFile('shared/core.js','utf8'),scope);
const catalogue={settings:{...scope.module.exports.defaults,online:false},services:initial.services.map(({priceMinor,durationMinutes,...s})=>s),barbers:[initial.barber],offers:initial.services.map(s=>({id:s.id+'-initial',version:1,barberId:initial.barber.id,serviceId:s.id,priceMinor:s.priceMinor,durationMinutes:s.durationMinutes}))};
await fs.writeFile('web/catalogue.json',JSON.stringify(catalogue));
const assets={};for(const file of await fs.readdir('web')){if(!types[path.extname(file)])continue;assets['/'+file]={content:await fs.readFile('web/'+file,'utf8'),type:types[path.extname(file)]};}
const worker=await fs.readFile('gateway/worker.js','utf8');await fs.writeFile('dist/server/index.js',worker+'\nexport default createHandler('+JSON.stringify(assets)+');\n');
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');await fs.copyFile('shared/core.js','apps-script/Core.gs');
await fs.writeFile('apps-script/Initial.gs','var ROYAL_INITIAL = '+JSON.stringify(initial)+';\n');
console.log('Built Worker, static assets and Apps Script sources.');
