// Runs simulated learners against the adaptive engine and prints a summary. Run: node tests/engine-sim.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=path.join(__dirname,'..');
const ctx={window:{}, console, Math, Date, Object, Array, Set, JSON};
ctx.window=ctx; vm.createContext(ctx);
for (const f of ['data.js','engine.js','rewards.js']) vm.runInContext(fs.readFileSync(path.join(dir,'js',f),'utf8'), ctx);
const {Engine, Rewards, LETTERS, STICKERS}=ctx.ABC;
console.log('letters',LETTERS.length,'stickers',STICKERS.length);
function profile(){return {level:1,points:0,stars:0,sparkles:0,stickers:[],items:{},recent:[],lastKeys:[],sessionNo:0,lastActive:0};}
function run(name, pCorrect, sessions, perSession, order){
  const p=profile(); let t=Date.now(); let ups=0, downs=0, repeats=0, last=null, first=null, badChoices=0;
  for(let s=0;s<sessions;s++){ t+=2*3600e3;
    for(let i=0;i<perSession;i++){ t+=20e3; Engine.touchSession(p,t);
      const item=Engine.nextItem(p,order); if(!first) first=item.key;
      if(item.key===last) repeats++; last=item.key;
      const ch=Engine.buildChoices(p,item);
      const chars=ch.map(c=>c.char);
      if(ch.filter(c=>c.correct).length!==1 || new Set(chars).size!==chars.length || chars.some(c=>(c===c.toUpperCase())!==!item.lower)) badChoices++;
      const ok=Math.random()<pCorrect(item);
      const r=Engine.recordAnswer(p,item,ok,t); Rewards.award(p,ok);
      if(r.levelChange==='up')ups++; if(r.levelChange==='down')downs++;
    }}
  const st=Object.entries(p.items);
  console.log(`${name}: first=${first} level=${p.level} ups=${ups} downs=${downs} seen=${st.length} mastered=${st.filter(([k,s])=>s.mastered).length} lowerSeen=${st.filter(([k])=>k===k.toLowerCase()).length} stickers=${p.stickers.length} immediateRepeats=${repeats} badChoices=${badChoices}`);
}
run('strong 5yo (95%)', ()=>0.95, 6, 24, 'az');
run('guessing toddler (2-choice ~50%)', ()=>0.5, 6, 24, 'az');
run('average (75%)', ()=>0.75, 10, 24, 'phonics');
run('one session only, strong', ()=>0.98, 1, 40, 'az');
