import {MAX_OPTICAL_INTERFACES} from '../../src/wavefront-optical-interface-budget.js';
export function opticalBudgetFromSearch(search){
 const values=new URLSearchParams(search).getAll('opticalInterfaces');
 if(!values.length)return {enabled:false,maximumInterfaces:MAX_OPTICAL_INTERFACES};
 if(values.length!==1||!(/^[1-9][0-9]*$/).test(values[0])||Number(values[0])>MAX_OPTICAL_INTERFACES)throw Error('Invalid optical interface allowance');
 return {enabled:true,maximumInterfaces:Number(values[0])};
}
