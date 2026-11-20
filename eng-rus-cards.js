(() => {
  'use strict';

  // Everyday phrases from EngRus, data/decks/english-5000.json.
  const cards = [
    ["Nice to meet you.", "Приятно познакомиться."],
    ["That sounds good.", "Звучит неплохо."],
    ["I hope so.", "Надеюсь."],
    ["Let me think.", "Дай подумать."],
    ["Just a moment.", "Одну минуту."],
    ["Take your time.", "Не торопись."],
    ["That's up to you.", "Тебе решать."],
    ["Why not?", "Почему бы и нет?"],
    ["Are you sure?", "Ты уверен?"],
    ["You're right.", "Ты прав."],
    ["That would be great.", "Было бы здорово."],
    ["I'd love to.", "С удовольствием."],
    ["It's worth a try.", "Стоит попробовать."],
    ["No problem at all.", "Никаких проблем."],
    ["I didn't catch that.", "Я не расслышал."],
    ["Could you say that again?", "Можешь повторить?"],
    ["Could you speak more slowly?", "Можешь говорить медленнее?"],
    ["What does that mean?", "Что это значит?"],
    ["How do you say this in English?", "Как это сказать по-английски?"],
    ["Could you write it down?", "Можешь это записать?"],
    ["Could you give me an example?", "Можешь привести пример?"],
    ["Now I understand.", "Теперь я понимаю."],
    ["Let's start again.", "Давай начнём заново."],
    ["How do you pronounce this?", "Как это произносится?"],
    ["Do you want to go for a walk?", "Хочешь прогуляться?"],
    ["This path leads to the park.", "Эта дорожка ведёт в парк."],
    ["Is it within walking distance?", "Туда можно дойти пешком?"],
    ["It's about a ten-minute walk.", "Пешком примерно десять минут."],
    ["Go straight ahead.", "Идите прямо."],
    ["Turn left at the traffic lights.", "Поверните налево на светофоре."],
    ["It's just around the corner.", "Это прямо за углом."],
    ["Could you show me on the map?", "Можете показать на карте?"],
    ["What's the name of this street?", "Как называется эта улица?"],
    ["Is there a shortcut?", "Есть путь покороче?"],
    ["It looks like rain.", "Похоже, будет дождь."],
    ["The sun is coming out.", "Выглядывает солнце."],
    ["What kind of music do you like?", "Какая музыка тебе нравится?"],
    ["I've had this song stuck in my head.", "Эта песня застряла у меня в голове."],
    ["It sounds familiar.", "Звучит знакомо."],
    ["Could you turn the volume up?", "Можешь сделать погромче?"],
    ["Could you turn it down a little?", "Можешь сделать чуть потише?"],
    ["I prefer listening with headphones.", "Я предпочитаю слушать в наушниках."],
    ["Are there any tickets left?", "Билеты ещё остались?"],
    ["What time does the concert end?", "Во сколько заканчивается концерт?"],
    ["What time is it now?", "Который сейчас час?"],
    ["See you in half an hour.", "Увидимся через полчаса."],
    ["I'll see you there.", "Увидимся там."],
    ["See you around.", "Ещё увидимся."]
  ];

  function readingTime(text, english) {
    const words = text.split(/\s+/).length;
    return Math.max(english ? 2800 : 3200, 1400 + words * (english ? 500 : 430));
  }

  function mount(host) {
    if (!host || host.querySelector('.engrus-cards')) return;
    host.innerHTML = `
      <section class="engrus-cards" aria-label="Англо-русские карточки">
        <span class="engrus-count" aria-label="Номер карточки"></span>
        <div class="engrus-card">
          <p class="engrus-english" lang="en"></p>
          <div class="engrus-answer">
            <p class="engrus-russian" lang="ru" hidden></p>
            <button type="button" class="engrus-reveal">Показать перевод</button>
          </div>
        </div>
        <div class="engrus-controls">
          <button type="button" class="engrus-previous" aria-label="Предыдущая карточка">←</button>
          <button type="button" class="engrus-playback">Пауза</button>
          <button type="button" class="engrus-next" aria-label="Следующая карточка">→</button>
        </div>
      </section>`;
    const view = host.querySelector('.engrus-cards');
    const english = view.querySelector('.engrus-english');
    const russian = view.querySelector('.engrus-russian');
    const count = view.querySelector('.engrus-count');
    const reveal = view.querySelector('.engrus-reveal');
    const playback = view.querySelector('.engrus-playback');
    let index = 0, paused = false, visible = !host.closest('[hidden]');
    let timer = 0, deadline = 0, remaining = 0;

    function schedule() {
      clearTimeout(timer);
      timer = 0;
      if (!visible || paused || document.hidden) return;
      deadline = performance.now() + remaining;
      timer = window.setTimeout(() => {
        timer = 0;
        if (!visible || paused || document.hidden) return;
        if (russian.hidden) showTranslation();
        else showCard(1);
      }, remaining);
    }
    function syncPlayback() {
      if (timer) remaining = Math.max(0, deadline - performance.now());
      schedule();
    }
    function showTranslation() {
      russian.hidden = false;
      reveal.hidden = true;
      remaining = readingTime(cards[index][1], false);
      schedule();
    }
    function showCard(step) {
      index = (index + step + cards.length) % cards.length;
      const [phrase, translation] = cards[index];
      english.textContent = phrase;
      russian.textContent = translation;
      russian.hidden = true;
      reveal.hidden = false;
      count.textContent = (index + 1) + ' / ' + cards.length;
      remaining = readingTime(phrase, true);
      schedule();
    }
    reveal.addEventListener('click', showTranslation);
    playback.addEventListener('click', () => {
      paused = !paused;
      playback.textContent = paused ? 'Продолжить' : 'Пауза';
      view.querySelector('.engrus-card').setAttribute('aria-live', paused ? 'polite' : 'off');
      syncPlayback();
    });
    view.querySelector('.engrus-previous').addEventListener('click', () => showCard(-1));
    view.querySelector('.engrus-next').addEventListener('click', () => showCard(1));
    view.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      showCard(event.key === 'ArrowLeft' ? -1 : 1);
    });
    window.addEventListener('yard-app-visibility', event => {
      if (event.detail?.app !== 'engrus') return;
      visible = event.detail.visible;
      syncPlayback();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    showCard(0);
  }

  window.YardEngRus = { mount };
})();
