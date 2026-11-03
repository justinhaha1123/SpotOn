import { readFileSync, writeFileSync } from "node:fs";
const FILE = "verification/seed-verification.csv";
const TODAY = "2026-10-25";
const NOTE = "api-match: 0 drift vs live TfL Unified API /Place/Type/CarPark on 2026-10-25 (totalSpaces, disabledBays, heightRestriction, dailyRate[cashless], saturdayRate, sundayRate, openHours, paymentMethods, postcode, notes). verifiedAt = TfL modified stamp, not a verification date.";
const raw = readFileSync(FILE, "utf8");
if (raw.includes("\r")) { console.error("ABORT: CR present"); process.exit(1); }
const trailing = raw.endsWith("\n");
const lines = raw.split("\n"); if (trailing) lines.pop();
const parse = line => { const f=[]; let c="",q=false;
  for (let i=0;i<line.length;i++){ const ch=line[i];
    if(q){ if(ch==='"'&&line[i+1]==='"'){c+='"';i++;} else if(ch==='"')q=false; else c+=ch; }
    else if(ch==='"')q=true; else if(ch===","){f.push(c);c="";} else c+=ch; }
  f.push(c); return f; };
const ser = f => f.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v).join(",");
const h = parse(lines[0]);
const col = n => { const i=h.indexOf(n); if(i<0){console.error("ABORT: no column",n);process.exit(1);} return i; };
const iId=col("id"), iSrc=col("source"), iSt=col("verify_status"), iNt=col("verify_notes"), iCk=col("checked_on");
const out=[lines[0]]; let n=0; const already=[];
for (const line of lines.slice(1)) {
  const f = parse(line);
  if (f.length!==h.length){ console.error("ABORT: field count",f.length,"on",f[iId]); process.exit(1); }
  if (f[iSrc]!=="tfl"){ out.push(line); continue; }
  if (f[iSt]!==""){ already.push(`${f[iId]}:${f[iSt]}`); out.push(line); continue; }
  f[iSt]="api-match"; f[iNt]=NOTE; f[iCk]=TODAY; out.push(ser(f)); n++;
}
if (already.length){ console.error("ABORT: tfl rows already stamped:",already.join(" ")); process.exit(1); }
if (n!==58){ console.error("ABORT: expected 58 tfl rows, got",n); process.exit(1); }
writeFileSync(FILE, out.join("\n")+(trailing?"\n":""));
console.log("stamped",n,"tfl rows");
