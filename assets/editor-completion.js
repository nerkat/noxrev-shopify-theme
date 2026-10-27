(() => {
  if(window.noxrevEditorCompletion)return;
  window.noxrevEditorCompletion=true;
  const instances=new WeakMap();
  const init=(root)=>{
    root.querySelectorAll('[data-guide-autoplay="true"]').forEach(section=>{
      if(instances.has(section)||window.Shopify?.designMode||window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
      const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.muted=true;entry.target.play().catch(()=>{})}else entry.target.pause()}),{threshold:.5});
      section.querySelectorAll('video').forEach(v=>observer.observe(v));instances.set(section,observer);
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init(document),{once:true});else init(document);
  document.addEventListener('shopify:section:load',e=>init(e.target));
  document.addEventListener('shopify:section:unload',e=>e.target.querySelectorAll('[data-guide-autoplay]').forEach(s=>{instances.get(s)?.disconnect();s.querySelectorAll('video').forEach(v=>v.pause())}));
  document.addEventListener('shopify:block:select',e=>{const details=e.target.matches?.('details')?e.target:e.target.querySelector?.('details');if(details)details.open=true;});
})();
