/* Compact scrollable palette list, sharing the animation menu's visual style. */
(() => {
  const select = document.querySelector('#theme-select');
  if (!select) return;
  const host = document.createElement('div'); host.className = 'theme-picker';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'theme-picker-toggle';
  toggle.setAttribute('role','combobox'); toggle.setAttribute('aria-label','Палитра'); toggle.setAttribute('aria-haspopup','listbox'); toggle.setAttribute('aria-controls','theme-options');
  const menu = document.createElement('div'); menu.id = 'theme-options'; menu.className = 'theme-options'; menu.setAttribute('role','listbox'); menu.setAttribute('aria-label','Палитра'); menu.hidden = true;
  select.after(host); host.append(toggle,menu); select.hidden = true;
  const options = [...select.options].map(option => {
    const button = document.createElement('button'); button.type='button'; button.tabIndex=-1; button.setAttribute('role','option'); button.dataset.value=option.value; button.textContent=option.textContent;
    button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));button.focus({preventScroll:true});}); menu.append(button);return button;
  });
  const sync=()=>{toggle.textContent=`${select.selectedOptions[0]?.textContent || 'Матовый углерод'} ${menu.hidden?'▾':'▴'}`;options.forEach(o=>o.setAttribute('aria-selected',String(o.dataset.value===select.value)));};
  const open=value=>{menu.hidden=!value;toggle.setAttribute('aria-expanded',String(value));sync();};
  toggle.addEventListener('click',()=>open(menu.hidden));
  host.addEventListener('keydown',event=>{
    if(event.key==='Escape'){open(false);toggle.focus();event.stopPropagation();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const wasClosed=menu.hidden;open(true);let i=options.indexOf(document.activeElement);
    if(wasClosed||i<0)i=Math.max(0,options.findIndex(o=>o.dataset.value===select.value));else i=event.key==='ArrowDown'?Math.min(options.length-1,i+1):Math.max(0,i-1);
    if(event.key==='Home')i=0;if(event.key==='End')i=options.length-1;options[i]?.focus();options[i]?.scrollIntoView({block:'nearest'});
  });
  document.addEventListener('pointerdown',event=>{const r=host.getBoundingClientRect(),m=menu.getBoundingClientRect();const inside=b=>event.clientX>=b.left&&event.clientX<=b.right&&event.clientY>=b.top&&event.clientY<=b.bottom;if(!host.contains(event.target)&&!inside(r)&&(menu.hidden||!inside(m)))open(false);});
  const panel=select.closest('#theme-panel');new MutationObserver(()=>{if(panel.hidden)open(false);}).observe(panel,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('inteon-theme-frame',sync);select.addEventListener('change',sync);open(false);
})();
