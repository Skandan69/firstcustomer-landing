const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
test('landing page contains one clean acquisition hero',()=>{assert.equal((html.match(/<!-- HERO -->/g)||[]).length,1);assert.match(html,/Find businesses worth contacting/);assert.doesNotMatch(html,/All free\. All AI-powered/);});
test('landing page contains no fabricated testimonial section or forever-free claims',()=>{assert.doesNotMatch(html,/Real businesses\. Real results/);assert.doesNotMatch(html,/Free forever/i);assert.doesNotMatch(html,/position 9/);});
test('landing page accurately describes current persistence and provider boundaries',()=>{assert.match(html,/stored server-side in Supabase/);assert.match(html,/provider credentials.*server-side/i);assert.doesNotMatch(html,/Your key is stored only in your browser/);});
test('landing page exposes the full acquisition workflow',()=>{for(const phrase of ['Find opportunities','Build a demo website','Open Proposal Builder','Open Sales CRM'])assert.match(html,new RegExp(phrase));});
