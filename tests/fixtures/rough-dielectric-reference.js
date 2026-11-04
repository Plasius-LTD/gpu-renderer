// Independent double-precision, normal-incidence angular quadrature. It is an
// integral of the specified BSDF, not an image/physical-device qualification.
export function fresnel(c,eta){
 const sin2=eta*eta*(1-c*c);if(sin2>=1)return 1;if(eta===1)return 0;
 const ct=Math.sqrt(1-sin2);
 return .5*(((eta*c-ct)/(eta*c+ct))**2+((c-eta*ct)/(c+eta*ct))**2);
}
export function integrateOpticalEnergy(roughness,transmission,eta=1/1.5,steps=65536){
 const f0=fresnel(1,eta),a2=Math.max(roughness**2,.0001)**2;
 let reflected=0,transmitted=0;
 for(let i=0;i<steps;i++){
  const z=(i+.5)/steps;
  reflected+=2*z*(1-transmission)*(1-f0)*(1-fresnel(z,eta))/steps;
  if(roughness<=.02||eta===1)continue;
  for(const sign of [1,-1]){
   const lz=z*sign,lx=Math.sqrt(1-z*z),hz0=(sign===1?1:eta)+lz;
   const len=Math.hypot(lx,hz0),flip=hz0<0?-1:1;
   const hz=flip*hz0/len,hx=flip*lx/len,lh=lx*hx+lz*hz;
   if(hz<=0||lh*lz<=0)continue;
   const d=a2/(Math.PI*(1-hz*hz+a2*hz*hz)**2);
   const g=2*z/(z+Math.sqrt(a2+(1-a2)*z*z)),f=fresnel(hz,eta);
   if(sign===1)reflected+=2*Math.PI*z/steps*(f*d*g/(4*z));
   else transmitted+=2*Math.PI*z/steps*(transmission*(1-f)*d*g*Math.abs(lh*hz)/(z*(lh+eta*hz)**2)*eta**2);
  }
 }
 if(roughness<=.02||eta===1){reflected+=f0;transmitted=(1-f0)*transmission*eta**2;}
 return {reflected,transmitted,total:reflected+transmitted};
}
