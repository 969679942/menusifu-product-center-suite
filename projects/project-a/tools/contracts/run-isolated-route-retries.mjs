import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,"../..");const runner=path.resolve(root,"../TestOps/services/runner");
const secretText=await fs.readFile(path.join(root,".secrets/runtime.env"),"utf8");const values=Object.fromEntries(secretText.split(/\r?\n/).filter(line=>line&&!line.trim().startsWith("#")&&line.includes("=")).map(line=>{const i=line.indexOf("=");return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^['"]|['"]$/g,"")]}));
if(!values.MC_USERNAME||!values.MC_PASSWORD)throw new Error("Missing runtime credentials");
const routes=process.argv.slice(2);if(!routes.length)throw new Error("Usage: node run-isolated-route-retries.mjs <route...>");
const checkpoint=path.join(root,"contracts/product-center/isolated-route-retry-latest.json");const results=[];
for(const route of routes){const startedAt=new Date().toISOString();const child=spawn(process.execPath,["--import","tsx","src/menusifu-audit-v2.ts"],{cwd:runner,stdio:"inherit",env:{...process.env,MENUSIFU_AUDIT_EMAIL:values.MC_USERNAME,MENUSIFU_AUDIT_PASSWORD:values.MC_PASSWORD,MENUSIFU_AUDIT_DISCOVERY_ONLY:"1",MENUSIFU_AUDIT_ROUTE:route}});const exitCode=await new Promise(resolve=>child.on("exit",code=>resolve(code??1)));results.push({route,startedAt,finishedAt:new Date().toISOString(),exitCode});await fs.writeFile(checkpoint,JSON.stringify(results,null,2)+"\n");}
if(results.some(result=>result.exitCode!==0))process.exitCode=1;
