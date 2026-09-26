import { createTiles } from "./wavefront-packers.js";
import { createSharedSampleRanges } from "./wavefront-adaptive-shared.js";

// Internal configuration-time plan, not a governor or persistent sample history.
export function createAdaptiveTilePlan({enabled=false,width,height,budgets}={}) {
  if(!enabled)return null;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>3840*2160
    ||!(budgets instanceof Uint8Array)||budgets.length!==width*height)throw new RangeError("Invalid adaptive tile budget dimensions.");
  return Object.freeze(createTiles(width,height,128).map(tile=>{
    const histogram=new Map();let expectedPrimaryRays=0;
    for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
      const budget=budgets[(tile.y+y)*width+tile.x+x];
      if(![1,2,4,8,16,32].includes(budget))throw new RangeError("Unsupported diagnostic sample tier.");
      histogram.set(budget,(histogram.get(budget)??0)+1);expectedPrimaryRays+=budget;
    }
    return Object.freeze({tile,expectedPrimaryRays,ranges:Object.freeze(createSharedSampleRanges([...histogram.keys()])),
      histogram:Object.freeze(Object.fromEntries(histogram))});
  }));
}
