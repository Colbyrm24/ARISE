/*
  Habit streaks.

  The DST cases are the point: streakFrom used to step by 86,400,000ms, so the
  twice-yearly 23- and 25-hour local days could skip a date or visit one twice
  and end a streak somebody had actually kept.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { streakFrom } from '@/lib/habits';
import { todayIn, daysAgoIn } from '@/lib/day';

const TZ='America/New_York';
const key=(d: Date)=>d.toISOString().slice(0,10);
const setOf=(...ds: string[])=>new Set<string>(ds);
const NOW=new Date('2026-08-25T18:00:00Z');
const back=(n: number)=>key(daysAgoIn(n,TZ,NOW));

// --- streakFrom
test('empty set -> 0',()=>assert.equal(streakFrom(new Set<string>(),todayIn(TZ,NOW)),0));
test('today only -> 1',()=>assert.equal(streakFrom(setOf(back(0)),todayIn(TZ,NOW)),1));
test('today not done but yesterday+ is -> counts, does not break',()=>
  assert.equal(streakFrom(setOf(back(1),back(2),back(3)),todayIn(TZ,NOW)),3));
test('today + 4 back -> 5',()=>
  assert.equal(streakFrom(setOf(back(0),back(1),back(2),back(3),back(4)),todayIn(TZ,NOW)),5));
test('gap at day 2 truncates',()=>
  assert.equal(streakFrom(setOf(back(0),back(1),back(3),back(4)),todayIn(TZ,NOW)),2));
test('yesterday missing breaks it even with older run',()=>
  assert.equal(streakFrom(setOf(back(0),back(2),back(3)),todayIn(TZ,NOW)),1));
test('only ancient history -> 0',()=>
  assert.equal(streakFrom(setOf(back(30),back(31)),todayIn(TZ,NOW)),0));

// --- DST cannot break a kept streak
test('30-day run across spring forward stays 30',()=>{
  const at=new Date('2026-03-15T18:00:00Z');
  const s=new Set<string>(); for(let i=0;i<30;i+=1) s.add(key(daysAgoIn(i,TZ,at)));
  assert.equal(streakFrom(s,todayIn(TZ,at)),30);
});
test('30-day run across fall back stays 30',()=>{
  const at=new Date('2026-11-10T18:00:00Z');
  const s=new Set<string>(); for(let i=0;i<30;i+=1) s.add(key(daysAgoIn(i,TZ,at)));
  assert.equal(streakFrom(s,todayIn(TZ,at)),30);
});
test('a full year of start dates never mis-counts a 14-day run',()=>{
  for(let d=0;d<365;d+=1){
    const at=new Date(Date.UTC(2026,0,1,20,0,0)+d*86400000);
    const s=new Set<string>(); for(let i=0;i<14;i+=1) s.add(key(daysAgoIn(i,TZ,at)));
    assert.equal(streakFrom(s,todayIn(TZ,at)),14,'day '+d);
  }
});
