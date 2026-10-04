const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
function source(name) {
  const start=script.indexOf(`const ${name} =`);
  return script.slice(start,script.indexOf('\n};',start)+3);
}
test('missing HTTP backend never presents local storage as a logged-in account',async () => {
  const context={isFileMode:false,sessionEmail:'',passIsLocal:false,
    requestJson:async()=>{throw new Error('API входа не подключён к этому адресу сайта');},
    apiMissing:()=>true,readStoredValue:()=> 'stale@example.test',localSessionStorageKey:'session',refreshAuthHint:()=>{}};
  await vm.runInNewContext(source('loadSession')+'\nloadSession();',context);
  assert.equal(context.passIsLocal,false);
  assert.equal(context.sessionEmail,'');
});
test('file preview retains its explicitly local demo pass',async () => {
  const context={isFileMode:true,sessionEmail:'',passIsLocal:false,
    readStoredValue:()=> 'demo@example.test',localSessionStorageKey:'session',refreshAuthHint:()=>{}};
  await vm.runInNewContext(source('loadSession')+'\nloadSession();',context);
  assert.equal(context.passIsLocal,true);
  assert.equal(context.sessionEmail,'demo@example.test');
});
