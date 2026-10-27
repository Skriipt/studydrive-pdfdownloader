// Optional real-layout regression check against the runtime fixture (no login or downloads).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const base = fileURLToPath(new URL('../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'sd-layout-'));
const fixturePath = join(workspace, 'fixture.html');
const profilePath = join(workspace, 'profile');
const read = path => readFileSync(join(base, path), 'utf8');
const names = ['utils.js','background.js','inject.js','ui-styles.js','content.js'];
let html = read('tests/browser-fixture.html');
html = html.replace(/const sources = await Promise.all\([\s\S]*?\n  \}\)\);/, `const sources = ${JSON.stringify(names.map(n=>read('extension/'+n)))};`);
html = html.replace(/const messages = await .*?;/, `const messages = ${JSON.stringify(JSON.parse(read('extension/_locales/de/messages.json')))};`);
writeFileSync(fixturePath,html);
const proc = spawn(process.env.CHROME_BIN || 'chromium-browser',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
let closeBrowser;
let launchError;
proc.on('error', error => { launchError = error; });
try {
 let targets;
 for(let i=0;i<50;i++){try{if(launchError) throw launchError; const port=readFileSync(join(profilePath,'DevToolsActivePort'),'utf8').split('\n')[0];targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break;}catch{await wait(100);}}
 if (!targets) throw launchError || Error('Chromium did not start; set CHROME_BIN to a headless Chromium executable.');
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 closeBrowser = () => send('Browser.close');
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Emulation.setDeviceMetricsOverride',{width:420,height:820,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
 await send('Page.navigate',{url:pathToFileURL(fixturePath).href+'?lang=de'});
 await wait(500);
 const find=(n,cls)=>n.attributes?.some((v,i,a)=>v==='class'&&a[i+1].split(' ').includes(cls))?n:[...(n.children||[]),...(n.shadowRoots||[])].map(c=>find(c,cls)).find(Boolean);
 async function info(cls){const {root}=await send('DOM.getDocument',{depth:-1,pierce:true});const node=find(root,cls);assert(node,cls+' exists');const {object}=await send('DOM.resolveNode',{nodeId:node.nodeId});const r=await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:`function(){const r=this.getBoundingClientRect(),s=getComputedStyle(this);return {x:r.x,y:r.y,width:r.width,height:r.height,radius:s.borderRadius,background:s.backgroundColor,display:s.display,text:this.textContent}}`,returnByValue:true});return r.result.value;}
 const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});if(process.env.LAYOUT_SCREENSHOT_DIR)writeFileSync(join(process.env.LAYOUT_SCREENSHOT_DIR,'sd-'+n+'.png'),Buffer.from(r.data,'base64'));};
 await evaluate("fixture.load('slow')");await wait(100);
 const card=await info('card'),primary=await info('primary'),size=await info('status');
 console.log('READY',JSON.stringify({card,primary,size}));await shot('ready');
 assert(Math.abs(primary.y+primary.height/2-size.y-size.height/2)<2,'file size and download label must share one row');
 assert(card.height<=48,'ready control must be a compact pill');assert.equal(card.radius,'999px');
 assert.equal(card.background,'rgb(0, 131, 116)');
 await evaluate("fixture.load('never')");await wait(100);await shot('waiting');
 assert((await info('card')).height<=48,'waiting control must be a compact pill');
 await evaluate("fixture.load('complete')");await wait(100);
 const p=await info('primary');for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:p.x+p.width/2,y:p.y+p.height/2,button:'left',clickCount:1});
 await wait(100);await shot('success');assert((await info('card')).height<=48,'success control must be a compact pill');
 await evaluate("fixture.load('partial')");await wait(100);await shot('error');
 for(const width of [320,420]){await send('Emulation.setDeviceMetricsOverride',{width,height:820,deviceScaleFactor:1,mobile:false});await evaluate("fixture.load('complete')");await wait(100);const r=await info('card');assert(r.x>=0&&r.x+r.width<=width,'control fits narrow viewport');}
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
 const dark=await info('card');assert.equal(dark.background,'rgb(0, 131, 116)','dark mode preserves the teal ready pill');
 await shot('dark-ready');
 console.log('PASS: compact pills, inline size, exact ready color, narrow viewports and dark mode');
}finally{
 if(proc.exitCode===null && proc.pid){const closed=once(proc,'exit');try{await closeBrowser?.();}finally{proc.kill();await closed;}}
 ws?.close();
 rmSync(workspace,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
