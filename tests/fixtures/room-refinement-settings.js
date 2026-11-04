// Laboratory controls; no production flag is enabled by this query parser.
export function roomRefinementSettings(search,currentMaximum=32) {
 const q=new URLSearchParams(search),keys=['refinementTotal','refinementMoving','refinementBudgetMs','refinementUnits','refinementFocus','refinementStationary','refinementPerformance','refinementResolution'];
 for(const key of keys)if(q.getAll(key).length>1)throw Error('Duplicate refinement control: '+key);
 const integer=(key,fallback,max)=>{const value=q.has(key)?Number(q.get(key)):fallback;if(!Number.isInteger(value)||value<1||value>max)throw Error('Invalid '+key);return value;};
 const child=key=>{const value=q.get(key)??'on';if(!['on','off'].includes(value))throw Error('Invalid '+key);return value==='on';};
 const maximum=integer('refinementTotal',currentMaximum,256),moving=integer('refinementMoving',Math.min(8,maximum),maximum),units=integer('refinementUnits',16,4096);
 const budget=Number(q.get('refinementBudgetMs')??(1000/60));if(!Number.isFinite(budget)||budget<0)throw Error('Invalid refinementBudgetMs');
 const resolution=q.get('refinementResolution')??'all';if(!['1080p','4k','all'].includes(resolution))throw Error('Invalid refinementResolution');
 return Object.freeze({maximum,moving,units,budget,focus:child('refinementFocus'),stationary:child('refinementStationary'),performance:child('refinementPerformance'),resolutions:resolution==='all'?['1080p','4k']:[resolution]});
}
