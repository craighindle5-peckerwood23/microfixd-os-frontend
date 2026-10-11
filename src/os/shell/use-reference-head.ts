import {useEffect,useRef,type RefObject} from 'react';
import type {HolographicHeadHandle} from './use-holographic-head.ts';

/** Generated reference artwork, animated without requiring WebGL. */
export function useReferenceHead(ref:RefObject<HTMLCanvasElement>) {
 const handle=useRef<HolographicHeadHandle|null>(null);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  let w=1,h=1,frame=0,form=.65,lit=false,alert=false;
  const image=new Image();image.src=`${import.meta.env.BASE_URL}assets/microfixd-hologram.png`;
  const resize=()=>{w=canvas.clientWidth||1;h=canvas.clientHeight||1;const d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);};
  resize();const observer=new ResizeObserver(resize);observer.observe(canvas);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const draw=(time=0)=>{
   ctx.clearRect(0,0,w,h);
   if(image.complete&&image.naturalWidth){
    const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight)*.96;
    const iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
    const float=reduced.matches?0:Math.sin(time*.0008)*2;
    ctx.globalAlpha=Math.max(.15,Math.min(1,.6+form*.4));
    ctx.filter=alert?'sepia(.7) saturate(2) hue-rotate(300deg)':lit?'brightness(1.15)':'none';
    ctx.drawImage(image,(w-iw)/2,(h-ih)/2+float,iw,ih);
    ctx.filter='none';ctx.globalAlpha=1;
   }
   frame=requestAnimationFrame(draw);
  };
  handle.current={setForm:p=>{form=p;},setEyesLit:v=>{lit=v;},setAlert:v=>{alert=v;}};draw();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();image.src='';handle.current=null;};
 },[ref]);return handle;
}
