const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const files=['server.cjs',...fs.readdirSync('server').filter(f=>f.endsWith('.cjs')).map(f=>path.join('server',f)),...fs.readdirSync('assets').filter(f=>f.endsWith('.js')).map(f=>path.join('assets',f))];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
const result=spawnSync(process.execPath,['--test',...fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).map(f=>path.join('tests',f))],{stdio:'inherit'});process.exit(result.status||0);
