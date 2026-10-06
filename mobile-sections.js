(() => {
  const mobile = matchMedia('(max-width: 800px) and (min-height: 501px), (max-width: 500px)');
  const chat = document.getElementById('chat-panel');
  const tracks = document.querySelector('.release-content');
  const slider = document.getElementById('mobile-section-slider');
  tracks.id = 'mobile-track-section';
  let progress = 0, dragging = false;
  const sync = () => {
    const active = mobile.matches;
    const section = progress >= .5 ? 'chat' : 'tracks';
    document.body.classList.toggle('mobile-section-dragging', active && dragging);
    document.body.style.setProperty('--mobile-section-progress', active ? progress : 0);
    document.body.dataset.mobileSection = active ? section : '';
    chat.hidden = active && progress === 0;
    chat.inert = active && (dragging || progress !== 1);
    tracks.inert = false;
    tracks.querySelector('.playlist-shell').inert = active && (dragging || progress !== 0);
    slider.value = String(progress * 1000);
    slider.setAttribute('aria-valuetext', section === 'chat' ? 'Чат' : 'Треки');
    const viewport = window.visualViewport;
    const keyboard = active && viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.body.style.setProperty('--mobile-keyboard', `${keyboard}px`);
  };
  const reveal = () => {
    const wasHidden = chat.hidden; sync();
    if (wasHidden && !chat.hidden && mobile.matches) openChat();
  };
  slider.addEventListener('input', () => {
    dragging = true; progress = Number(slider.value) / 1000;
    document.getElementById('chat-input').blur(); reveal();
  });
  const settle = () => { dragging = false; progress = progress >= .5 ? 1 : 0; reveal(); };
  slider.addEventListener('change', settle);
  slider.addEventListener('pointercancel', settle);
  slider.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault(); dragging = false;
    progress = ['ArrowRight','ArrowUp','End'].includes(event.key) ? 1 : 0; reveal();
  });
  mobile.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  sync();
})();
