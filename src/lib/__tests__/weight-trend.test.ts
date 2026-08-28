/*
  Week-over-week weight.

  The first two cases pin the off-by-one this module was extracted to fix: the
  old duplicated code compared an 8-day window to a 7-day one and reported a
  steady 0.2 lb/day loss as -1.5 instead of -1.4.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { weekOverWeek, type WeightPoint } from '@/lib/weight-trend';

const TZ='America/New_York';
const NOW=new Date('2026-08-25T18:00:00Z'); // Aug 25 in NY
const day=(iso: string, w: number)=>({date:new Date(iso+'T00:00:00Z'),weight:w});

// --- the off-by-one this replaces
// Daily weigh-ins, exactly -0.2 lb/day from 200.0 on Aug 11.
const steady: WeightPoint[] = [];
for(let i=0;i<=14;i+=1){
  const d=new Date(Date.UTC(2026,7,11+i));
  steady.push({date:d, weight:+(200 - 0.2*i).toFixed(2)});
}
test('7 vs 7 reports the true weekly change (-1.4)',()=>{
  const r=weekOverWeek(steady,TZ,NOW);
  assert.equal(r.recentCount,7,'recent window must be 7 days, got '+r.recentCount);
  assert.equal(r.priorCount,7,'prior window must be 7 days, got '+r.priorCount);
  assert.equal(Number(r.change?.toFixed(2)),-1.40);
});
test('the old 8-vs-7 windows would have said -1.5',()=>{
  // reproduce the old code exactly
  const cut=Date.UTC(2026,7,18), prevCut=Date.UTC(2026,7,11);
  const rec=steady.filter(p=>p.date.getTime()>=cut);
  const pri=steady.filter(p=>p.date.getTime()>=prevCut&&p.date.getTime()<cut);
  const m=(a: {weight:number}[])=>a.reduce((s,p)=>s+p.weight,0)/a.length;
  assert.equal(rec.length,8); assert.equal(pri.length,7);
  assert.equal(Number((m(rec)-m(pri)).toFixed(2)),-1.50);
});

// --- window edges
test('today is included in recent',()=>{
  const r=weekOverWeek([day('2026-08-25',180)],TZ,NOW);
  assert.equal(r.recentCount,1);
});
test('day -6 is the oldest recent day',()=>{
  assert.equal(weekOverWeek([day('2026-08-19',180)],TZ,NOW).recentCount,1);
});
test('day -7 falls into prior, not recent',()=>{
  const r=weekOverWeek([day('2026-08-18',180)],TZ,NOW);
  assert.equal(r.recentCount,0); assert.equal(r.priorCount,1);
});
test('day -13 is the oldest prior day',()=>{
  assert.equal(weekOverWeek([day('2026-08-12',180)],TZ,NOW).priorCount,1);
});
test('day -14 is outside both',()=>{
  const r=weekOverWeek([day('2026-08-11',180)],TZ,NOW);
  assert.equal(r.recentCount,0); assert.equal(r.priorCount,0);
});
test('the two windows never overlap',()=>{
  const all=[];for(let i=0;i<20;i+=1)all.push(day(new Date(Date.UTC(2026,7,25-i)).toISOString().slice(0,10),180));
  const r=weekOverWeek(all,TZ,NOW);
  assert.equal(r.recentCount,7); assert.equal(r.priorCount,7);
});

// --- no NaN ever reaches a screen
test('empty input -> null, not NaN',()=>assert.equal(weekOverWeek([],TZ,NOW).change,null));
test('only recent -> null',()=>assert.equal(weekOverWeek([day('2026-08-25',180)],TZ,NOW).change,null));
test('only prior -> null',()=>assert.equal(weekOverWeek([day('2026-08-14',180)],TZ,NOW).change,null));
test('change is a real number when both present',()=>{
  const c=weekOverWeek([day('2026-08-25',178),day('2026-08-14',180)],TZ,NOW).change;
  assert.ok(Number.isFinite(c)); assert.equal(c,-2);
});
test('gain reports positive',()=>{
  assert.equal(weekOverWeek([day('2026-08-25',182),day('2026-08-14',180)],TZ,NOW).change,2);
});

// --- timezone
test('LA evening weigh-in counts in the right week',()=>{
  // 2026-08-19 06:00Z = Aug 18 11pm PDT. In LA "today" is Aug 25, so day -6
  // is Aug 19 and this reading is day -7 => prior. In NY it is also Aug 19.
  const la=weekOverWeek([day('2026-08-19',180)],'America/Los_Angeles',new Date('2026-08-26T05:00:00Z'));
  assert.equal(la.recentCount,1); // Aug 25 in LA at 10pm; -6 = Aug 19
});
test('garbage tz falls back rather than throwing',()=>{
  assert.equal(weekOverWeek([day('2026-08-25',180)],'Not/AZone',NOW).recentCount,1);
});
