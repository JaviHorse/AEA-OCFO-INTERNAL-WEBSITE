import {readFile} from 'node:fs/promises';
const origin='http://localhost:3000';
const start=await fetch(`${origin}/auth/sign-in`,{method:'POST',headers:{Origin:origin},redirect:'manual'});
const cookie=start.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const callback=await fetch(`${origin}/auth/callback?code=00000000-0000-4000-8000-000000000000`,{headers:{Cookie:cookie},redirect:'manual'});
console.log('Callback classification:',new URL(callback.headers.get('location')).searchParams.get('error'));
console.log(await readFile('.diagnostics/oauth.json','utf8'));
