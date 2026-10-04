import { mkdir, writeFile } from "node:fs/promises";
const [mode = "production", port = "3100"] = process.argv.slice(2);
const samples=[];
for (let trial=0;trial<3;trial++) for(const route of ["/login","/dashboard","/requests","/approvals"]) {
  const start=performance.now(); const r=await fetch(`http://127.0.0.1:${port}${route}`,{redirect:"manual"}); const body=await r.arrayBuffer();
  samples.push({route,trial,status:r.status,ms:+(performance.now()-start).toFixed(1),bytes:body.byteLength});
}
await mkdir("artifacts/performance",{recursive:true});
await writeFile(`artifacts/performance/${mode}-routes.json`,JSON.stringify({context:"Unauthenticated localhost HTTP timings; protected routes redirect to login. Not authenticated user-flow timings.",samples},null,2));
console.log(JSON.stringify(samples,null,2));
