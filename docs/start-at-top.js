/* Reset restored positions on entry, while keeping deliberate in-page navigation. */
(()=>{
 if('scrollRestoration' in history)history.scrollRestoration='manual';
 if(location.hash&&!location.hash.startsWith('#booking='))history.replaceState(null,'',location.pathname+location.search);
 let touched=false;for(const event of ['pointerdown','touchstart','wheel','keydown'])addEventListener(event,()=>{touched=true;},{passive:true});
 function top(){if(touched)return;const html=document.documentElement,previous=html.style.scrollBehavior;html.style.scrollBehavior='auto';window.scrollTo(0,0);html.style.scrollBehavior=previous;}
 top();addEventListener('pageshow',()=>{touched=false;top();requestAnimationFrame(()=>{top();requestAnimationFrame(top);});});addEventListener('load',top,{once:true});
})();
