import fs from 'node:fs/promises';
let html=await fs.readFile('web/admin.html','utf8');html=html.replace('returnTo=%2F','return_to=%2F');await fs.writeFile('web/admin.html',html);
let admin=await fs.readFile('web/admin.js','utf8');admin=admin.replace("editEntity(v.table,v.snapshot)","editEntity(v.table,{...v.snapshot,version:db()[v.table].find(x=>x.id===v.entityId)?.version||v.snapshot.version})");await fs.writeFile('web/admin.js',admin);
