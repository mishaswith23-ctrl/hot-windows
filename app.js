'use strict';
// Приложение «Горящие окна»: каталог окон, бронь, «Мои брони» и кабинет заведения.
// Кирпичики — разметка, значки, запросы, шторки и переходы — в kit.js.

const state = {
  boot: null,
  bootAt: 0,
  stack: [],
  current: null,
  tab: null,
  city: null,     // город каталога
  kind: 'all',    // фильтр каталога: all, sauna или beauty
  cabinet: null,  // последний ответ кабинета: из него формы берут заведение
};

// Вид заведения: значок, цвет плашки и как о нём говорить
const KINDS = {
  sauna: { label: 'Бани', glyph: 'steam', tint: 'flame', where: 'в банях' },
  beauty: { label: 'Красота', glyph: 'polish', tint: 'polish', where: 'у мастеров' },
};
const kindOf = venue => KINDS[venue && venue.kind] || KINDS.sauna;
// Кто подтверждает бронь: «Сауна подтвердит», «Баня подтвердит», «Мастер подтвердит»
const venueWord = venue => (venue.kind === 'beauty' ? 'Мастер' : /сауна/i.test(venue.name) ? 'Сауна' : 'Баня');

async function refreshBoot(maxAgeMs) {
  if (state.boot && Date.now() - state.bootAt < maxAgeMs) return state.boot;
  state.boot = await api('bootstrap');
  state.bootAt = Date.now();
  return state.boot;
}

// Навигация

async function show(route, direction) {
  state.current = route;
  document.body.classList.toggle('flow', state.stack.length > 0);
  syncBackButton();
  renderTabs();
  const screen = h('section.screen', skeleton());
  swapScreen(screen, direction);
  await fill(screen, route);
}

async function fill(screen, route) {
  try {
    const content = await SCREENS[route.name](route.params || {}, screen);
    if (state.current === route) screen.replaceChildren(h('.inner', content));
  } catch (error) {
    if (state.current !== route) return;
    screen.replaceChildren(h('.inner', h('.card.empty.rise',
      h('.empty-icon', icon('alert', 26)),
      h('p', error.message),
      h('button.btn.ghost', { style: 'margin-top:18px', onclick: () => fill(screen, route) }, 'Повторить'),
    )));
  }
}

function push(name, params) {
  state.stack.push(state.current);
  haptic();
  show({ name, params }, 'forward');
}

function back() {
  if (!state.stack.length) return;
  haptic();
  show(state.stack.pop(), 'back');
}

function resetTo(name) {
  state.stack = [];
  state.tab = name;
  haptic('select');
  show({ name }, 'tab');
}

// Обновляет открытый экран без анимации: после изменений и при возвращении в приложение.
// fresh: false — без перезагрузки общих данных, например при смене города или фильтра.
function softRefresh({ fresh = true } = {}) {
  const route = state.current;
  if (!route || !['feed', 'mine', 'cabinet', 'window'].includes(route.name)) return;
  if (fresh) state.bootAt = 0;
  const screen = stage.lastElementChild;
  const top = screen.scrollTop;
  screen.classList.add('quiet');
  fill(screen, route).then(() => { screen.scrollTop = top; });
}

function syncBackButton() {
  if (!nativeBack()) return;
  if (state.stack.length) sdk().BackButton.show();
  else sdk().BackButton.hide();
}

function topbar(title) {
  return h('.topbar.rise', { i: 0 },
    nativeBack() ? null : h('button.back', { onclick: back, 'aria-label': 'Назад' }, icon('back', 20)),
    h('h1.title', title),
  );
}

const tabGlow = h('.tab-glow');

function renderTabs() {
  const items = [['feed', 'Окна', 'flame'], ['mine', 'Мои брони', 'list']];
  if (state.boot.is_staff) items.push(['cabinet', 'Кабинет', 'chart']);
  const index = items.findIndex(([name]) => name === state.tab);
  // Подсветка остаётся тем же элементом, поэтому плавно переезжает к новой вкладке
  if (tabGlow.parentNode !== tabs) tabs.prepend(tabGlow);
  while (tabs.lastChild && tabs.lastChild !== tabGlow) tabs.lastChild.remove();
  tabs.style.setProperty('--count', items.length);
  tabs.style.setProperty('--index', Math.max(index, 0));
  tabGlow.style.opacity = index < 0 ? 0 : 1;
  tabs.append(...items.map(([name, label, glyph]) =>
    h(`button.tab${state.tab === name ? '.active' : ''}`, {
      onclick: () => { if (state.tab !== name || state.stack.length) resetTo(name); },
    },
      icon(glyph), label,
      // Брони, которые ждут ответа заведения
      name === 'cabinet' && state.boot.pending > 0 && h('span.tab-badge', String(state.boot.pending)),
    )));
}

// Город и подписки

const currentCity = () => state.boot.cities.find(city => city.id === state.city) || state.boot.cities[0] || null;

// Город из ссылки, затем запомненный, затем первый, где есть окна
function pickCity() {
  const cities = state.boot.cities;
  const wanted = query.get('city') || recall('hot.city');
  const city = cities.find(c => c.id === wanted) || cities.find(c => c.windows > 0) || cities[0];
  return city ? city.id : null;
}

function setCity(id) {
  state.city = id;
  remember('hot.city', id);
}

const subscribed = (cityId, kind) => state.boot.subscriptions.some(s => s.city_id === cityId && s.kind === kind);

function citySheet() {
  openSheet(close => [
    h('h2', 'Город'),
    h('p', 'Окна и уведомления — в выбранном городе.'),
    h('.sheet-actions', state.boot.cities.map(city => h(`button.btn${city.id === state.city ? '' : '.ghost'}`, {
      onclick: () => {
        close();
        if (city.id === state.city) return;
        setCity(city.id);
        haptic('select');
        softRefresh({ fresh: false });
      },
    },
      city.name,
      city.windows > 0 && h('span', { style: 'opacity:.7;font-weight:600' },
        `· ${city.windows} ${plural(city.windows, 'окно', 'окна', 'окон')}`),
    ))),
  ]);
}

function filterChips() {
  const options = [['all', 'Всё', null], ...Object.entries(KINDS).map(([kind, info]) => [kind, info.label, info.glyph])];
  return h('.filters.rise', { i: 1 }, options.map(([kind, label, glyph]) =>
    h(`button.filter${state.kind === kind ? '.active' : ''}`, {
      onclick: () => {
        if (state.kind === kind) return;
        state.kind = kind;
        haptic('select');
        softRefresh({ fresh: false });
      },
    }, glyph && icon(glyph, 16), label)));
}

// Подписка на новые окна выбранного вида в городе: бот напишет в чат
function bellCard(city) {
  const kinds = state.kind === 'all' ? Object.keys(KINDS) : [state.kind];
  const on = kinds.every(kind => subscribed(city.id, kind));
  const where = state.kind === 'all' ? '' : ` ${KINDS[state.kind].where}`;
  const button = h(`button.btn.small${on ? '.ghost' : ''}`, { onclick: () => toggle() }, on ? 'Выключить' : 'Включить');
  const card = h(`.card.bell.rise${on ? '.on' : ''}`, { i: 2 },
    h('.bell-icon', icon(on ? 'check' : 'bell', 22)),
    h('.grow',
      h('.bell-title', on ? 'Уведомления включены' : 'Сообщать о новых окнах'),
      h('.bell-text', on
        ? `Напишем в чат, как только появится окно${where} ${city.name_in}`
        : `Новые окна${where} ${city.name_in} — сразу в чат с ботом`),
    ),
    button,
  );

  async function toggle() {
    button.disabled = true;
    try {
      let result;
      for (const kind of kinds) {
        result = await api('subscriptions', { method: 'POST', body: { city: city.id, kind, on: !on } });
      }
      state.boot.subscriptions = result.subscriptions;
      haptic('success');
      toast(on ? 'Уведомления выключены' : 'Готово! Новые окна придут в чат с ботом');
      const next = bellCard(city);
      next.classList.remove('rise');
      card.replaceWith(next);
    } catch (error) {
      button.disabled = false;
      haptic('error');
      toast(error.message, 'error');
    }
  }

  return card;
}

function windowCard(win, index, onclick) {
  const kind = kindOf(win.venue);
  return tilt(h('button.card.window-card.rise', { i: index, onclick },
    h(`.plate.tint-${kind.tint}`, icon(kind.glyph, 24)),
    h('.window-info',
      h('.window-time', win.time),
      h('.window-title', win.title),
      h('.window-venue', [win.venue.name, win.venue.district].filter(Boolean).join(' · ')),
    ),
    h('.window-price',
      win.discount > 0 && h('span.discount', `−${win.discount}%`),
      h('span.price', rub(win.price)),
      win.old_price > win.price && h('s.old', rub(win.old_price)),
    ),
  ));
}

function howItWorks(venue) {
  const minutes = state.boot.confirm_minutes;
  return h('.card.how.rise', { i: 3 },
    h('.eyebrow', 'Как это работает'),
    h('ol.steps',
      h('li', h('b', 'Бронь бесплатная'), ' — платите на месте.'),
      h('li', `${venueWord(venue)} подтвердит её в течение ${minutes} ${plural(minutes, 'минуты', 'минут', 'минут')}.`),
      h('li', 'Адрес и телефон придут в чат с ботом сразу после подтверждения.'),
    ),
  );
}

// Своя бронь этого окна: вместо кнопки — её состояние
function mineNote(booking) {
  const confirmed = booking.status === 'confirmed';
  return h('.card.note.rise', { i: 3 },
    icon(confirmed ? 'check' : 'clock'),
    h('.grow',
      h('b', confirmed ? 'Бронь подтверждена' : `Ждём подтверждения до ${booking.deadline}`),
      h('.muted.small', confirmed
        ? 'Адрес и телефон — в «Моих бронях» и в чате с ботом.'
        : 'Как только заведение ответит, пришлём сообщение в чат.'),
    ),
  );
}

const takenNote = () => h('.card.note.rise', { i: 3 },
  icon('lock'),
  h('.grow', h('b', 'Это окно уже забронировали'), h('.muted.small', 'Посмотрите другие — новые появляются каждый день.')),
);

// Бронь: контакты спрашиваем один раз, дальше — одно касание

function startBooking(win, button) {
  if (state.boot.client) return book(win, null, button);
  push('contact', { win });
}

async function book(win, contact, button) {
  button.disabled = true;
  let booking;
  try {
    booking = await api(`windows/${win.id}/book`, { method: 'POST', body: contact || {} });
  } catch (error) {
    button.disabled = false;
    haptic('error');
    toast(error.message, 'error');
    if (error.status === 409 || error.status === 404) {
      // Окно ушло: возвращаемся к нему — там уже видно, что его забронировали
      while (state.stack.length && state.current.name !== 'window') state.current = state.stack.pop();
      show(state.current, 'back');
    }
    return;
  }
  haptic('success');
  // Бронь уже создана; если обновить данные не вышло, обновим их позже
  state.bootAt = 0;
  await refreshBoot(0).catch(() => {});
  state.stack = [];
  state.tab = 'feed';
  show({ name: 'sent', params: { booking } }, 'forward');
}

const STATUS_PILLS = {
  pending: booking => h('span.pill.wait', icon('clock', 14), `Ждём ответа до ${booking.deadline}`),
  confirmed: () => h('span.pill.solid', icon('check', 14), 'Подтверждена'),
  declined: () => h('span.pill.bad', 'Окно уже заняли'),
  expired: () => h('span.pill.bad', 'Не успели подтвердить'),
  cancelled_venue: () => h('span.pill.bad', 'Отменена заведением'),
};

const telHref = phone => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

function bookingCard(booking, index) {
  const win = booking.window;
  const venue = booking.venue;
  const live = booking.status === 'pending' || booking.status === 'confirmed';
  return tilt(h(`.card.rise${live ? '' : '.faded'}`, { i: index },
    h('.booking-head', (STATUS_PILLS[booking.status] || STATUS_PILLS.declined)(booking), h('span.price', rub(win.price))),
    h('.booking-when', { style: 'margin-top:12px' }, `${win.day}, ${win.time}`),
    h('.booking-name', win.title),
    h('.muted.small', [venue.name, venue.district].filter(Boolean).join(' · ')),
    booking.status === 'confirmed' && [
      venue.address && h('.row.small', icon('pin', 18), h('span', venue.address)),
      venue.phone && h('a.call-link.small', { href: telHref(venue.phone) }, icon('phone', 18), h('span', venue.phone)),
    ],
    booking.status === 'pending' && h('.row.muted.small', icon('lock', 18), h('span', 'Адрес и телефон откроются после подтверждения')),
    live && h('.booking-actions', h('button.btn.link.bad', { onclick: () => cancelBooking(booking) }, 'Отменить')),
  ));
}

async function cancelBooking(booking) {
  const win = booking.window;
  const yes = await confirmSheet({
    title: 'Отменить бронь?',
    text: `${win.day}, ${win.time} — ${win.title}. Заведение получит уведомление.`,
    confirm: 'Да, отменить',
    danger: true,
  });
  if (!yes) return;
  try {
    await api(`bookings/${booking.id}/cancel`, { method: 'POST' });
    toast('Бронь отменена');
  } catch (error) {
    toast(error.message, 'error');
  }
  softRefresh();
}

// Кабинет

function statsCard(stats) {
  const stat = (value, label, note) =>
    h('div', h('.stat-value', String(value)), h('.stat-label', label), note && h('.stat-note', note));
  return tilt(h('.card.resting.rise', { i: 1 },
    h('.eyebrow', 'Платформа за 7 дней'),
    h('.stat-grid',
      stat(stats.visitors_week, 'новых в боте', `всего ${stats.visitors}`),
      stat(stats.subscribers, 'подписчиков', 'ждут новых окон'),
      stat(stats.windows_week, 'окон выставлено'),
      stat(stats.booked_week, 'броней подтверждено', `заявок ${stats.requests_week}`),
    ),
    h('.stat-note', { style: 'margin-top:12px' }, `Заведений: ${stats.venues}, из них владельцев в боте: ${stats.owners}`),
    stats.sources.length > 0 && h('.sources',
      h('.stat-label', 'Откуда пришли: метка в ссылке на бота'),
      stats.sources.map(item => h('span.chip', item.source, h('b', String(item.count))))),
  ));
}

function pendingCard(booking, index) {
  const win = booking.window;
  const venue = booking.venue;
  const confirm = h('button.btn', { onclick: () => decide(booking, 'confirm', confirm) }, 'Подтвердить');
  const decline = h('button.btn.ghost', { onclick: () => decide(booking, 'decline', decline) }, 'Уже занято');
  return h('.card.pending-card.pop', { i: index },
    h('.booking-head', h('span.pill.wait', icon('clock', 14), `Ответить до ${booking.deadline}`), h('span.price', rub(win.price))),
    h('.booking-when', { style: 'margin-top:12px' }, `${win.day}, ${win.time}`),
    h('.booking-name', `${win.title} · ${venue.name}`),
    h('.muted', { style: 'margin-top:6px' }, booking.client_name),
    h('a.client-link', { href: telHref(booking.client_phone) }, icon('phone', 18), booking.client_phone),
    // Заведение ещё не в боте: администратор звонит туда сам
    booking.via_admin && venue.phone && h('a.call-link.small', { href: telHref(venue.phone) },
      icon('phone', 18), h('span', `Заведение: ${venue.phone}`)),
    h('.two', { style: 'margin-top:14px' }, confirm, decline),
  );
}

async function decide(booking, action, button) {
  button.disabled = true;
  try {
    await api(`cabinet/bookings/${booking.id}/${action}`, { method: 'POST' });
    haptic('success');
    toast(action === 'confirm' ? 'Подтверждено — гость получил адрес и телефон' : 'Окно снято, гость предупреждён');
  } catch (error) {
    haptic('error');
    toast(error.message, 'error');
  }
  softRefresh();
}

function venueBlock(venue, index, isAdmin) {
  const kind = kindOf(venue);
  return h('.venue-block.rise', { i: index },
    h('.venue-head',
      h(`.plate.tint-${kind.tint}`, icon(kind.glyph, 22)),
      h('.grow',
        h('.service-name', venue.name),
        h('.service-meta', [venue.city, venue.district].filter(Boolean).join(' · ')),
      ),
      isAdmin && h('button.icon-btn', { onclick: () => push('venueForm', { venueId: venue.id }), 'aria-label': 'Изменить заведение' },
        icon('edit', 18)),
    ),
    h('.venue-badges',
      !venue.active && h('span.badge.past', 'Выключено'),
      isAdmin && (venue.owner
        ? h('span.badge', icon('check', 14), 'Владелец в боте')
        : h('button.badge.warn', { onclick: () => inviteSheet(venue) }, icon('share', 14), 'Пригласить владельца')),
      // Что принёс сервис: главный довод для заведения
      venue.sold.count > 0 && h('span.badge.money',
        `За 30 дней: ${venue.sold.count} ${plural(venue.sold.count, 'бронь', 'брони', 'броней')} на ${rub(venue.sold.sum)}`),
    ),
    venue.windows.length
      ? h('.stack', venue.windows.map((win, n) => cabinetWindow(win, n)))
      : h('p.muted.small', { style: 'margin:0 6px' }, 'Сейчас окон нет. Есть свободное время — выставьте его, подписчики узнают сразу.'),
    venue.active && h('button.btn', { style: 'margin-top:12px', onclick: () => push('publish', { venueId: venue.id }) },
      icon('plus', 20), 'Выставить окно'),
  );
}

function cabinetWindow(win, index) {
  const booking = win.booking;
  const status = win.status === 'open'
    ? h('span.badge', 'В продаже')
    : win.status === 'held'
      ? h('span.badge.wait', 'Ждёт ответа')
      : h('span.badge.money', icon('check', 14), 'Забронировано');
  return h('.card.pop', { i: index },
    h('.booking-head', h('span.timeline-time', win.time), status),
    h('.booking-name', `${win.day} · ${win.title}`),
    h('.muted.small', win.old_price > win.price
      ? `${rub(win.price)} вместо ${rub(win.old_price)}, скидка ${win.discount}%`
      : rub(win.price)),
    booking && booking.status === 'confirmed' && [
      h('.muted', { style: 'margin-top:8px' }, booking.client_name),
      h('a.client-link', { href: telHref(booking.client_phone) }, icon('phone', 18), booking.client_phone),
    ],
    win.status === 'open' && h('.booking-actions',
      h('button.btn.link.bad', { onclick: () => closeWindow(win) }, 'Снять с продажи')),
    booking && booking.status === 'confirmed' && h('.booking-actions',
      h('button.btn.link.bad', { onclick: () => venueCancel(booking) }, 'Отменить бронь')),
  );
}

async function closeWindow(win) {
  const yes = await confirmSheet({
    title: 'Снять окно?',
    text: `${win.day}, ${win.time} — ${win.title}. Гости больше не увидят его в каталоге.`,
    confirm: 'Снять',
    danger: true,
  });
  if (!yes) return;
  try {
    await api(`cabinet/windows/${win.id}/close`, { method: 'POST' });
    toast('Окно снято с продажи');
  } catch (error) {
    toast(error.message, 'error');
  }
  softRefresh();
}

async function venueCancel(booking) {
  const yes = await confirmSheet({
    title: 'Отменить бронь?',
    text: `${booking.window.time}, ${booking.client_name}. Гость получит уведомление, а окно снимется с продажи.`,
    confirm: 'Да, отменить',
    danger: true,
  });
  if (!yes) return;
  try {
    await api(`cabinet/bookings/${booking.id}/cancel`, { method: 'POST' });
    toast('Бронь отменена, гость предупреждён');
  } catch (error) {
    toast(error.message, 'error');
  }
  softRefresh();
}

// Ссылка для владельца: откроет её в Telegram — и брони заведения пойдут ему
async function inviteSheet(venue) {
  let invite;
  try {
    invite = await api(`cabinet/venues/${venue.id}/invite`, { method: 'POST' });
  } catch (error) {
    return toast(error.message, 'error');
  }
  // Пока /setup не запомнил имя бота, ссылку не собрать: тогда владелец отправит боту команду с кодом
  const link = invite.link || `/start v_${invite.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Скопировано');
    } catch {
      toast('Не получилось скопировать — выделите ссылку и скопируйте вручную', 'error');
    }
  };
  const text = `${venue.name} — подключение к «Горящим окнам»: брони будут приходить вам в Telegram.`;
  openSheet(close => [
    h('h2', 'Пригласить владельца'),
    h('p', `${venue.name}: отправьте ссылку владельцу. Он откроет её в Telegram — и брони будут приходить ему, а не вам. ` +
      'Ссылка одноразовая, прежняя больше не работает.'),
    h('.invite-link', link),
    h('.sheet-actions',
      invite.link && h('button.btn', {
        onclick: () => {
          close();
          openLink(`https://t.me/share/url?url=${encodeURIComponent(invite.link)}&text=${encodeURIComponent(text)}`);
        },
      }, icon('share', 20), 'Отправить в Telegram'),
      h('button.btn.ghost', { onclick: copy }, icon('copy', 20), 'Скопировать'),
    ),
  ]);
}

// Минуты между «18:00» и «21:00»; конец раньше начала — значит, окно заканчивается после полуночи
function minutesBetween(start, end) {
  if (!/^\d\d:\d\d$/.test(start) || !/^\d\d:\d\d$/.test(end)) return 0;
  const toMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (toMinutes(end) - toMinutes(start) + 1440) % 1440 || 1440;
}

// «Баня на 3 часа», «Сауна на 2 ч 30 мин»
function rentTitle(venue, minutes) {
  const word = venueWord(venue);
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${word} на ${hours} ${plural(hours, 'час', 'часа', 'часов')}` : `${word} на ${duration(minutes)}`;
}

const SCREENS = {
  // Каталог: окна города по дням

  async feed() {
    await refreshBoot(20000);
    const city = currentCity();
    if (!city) return emptyState('pin', 'Города скоро появятся', 'Платформа только запускается.');
    const list = await api(`windows?city=${encodeURIComponent(city.id)}${state.kind === 'all' ? '' : `&kind=${state.kind}`}`);
    const groups = [];
    for (const win of list) {
      const last = groups[groups.length - 1];
      if (last && last.date === win.date) last.items.push(win);
      else groups.push({ date: win.date, day: win.day, items: [win] });
    }
    const kinds = state.kind === 'all' ? Object.keys(KINDS) : [state.kind];
    let index = 3;
    return [
      h('.feed-head.rise', { i: 0 },
        h('.eyebrow', icon('flame', 14), 'Горящие окна'),
        h('button.city-btn', { onclick: citySheet, 'aria-label': 'Сменить город' }, h('span.title', city.name), icon('down', 22)),
        h('p.lead', 'Свободное время со скидкой в банях и у мастеров. Бронь — в два касания, без звонков.'),
      ),
      filterChips(),
      bellCard(city),
      groups.length
        ? groups.map(group => [
            h('h2.section.rise', { i: index++ }, group.day),
            h('.stack', group.items.map(win => windowCard(win, index++, () => push('window', { id: win.id })))),
          ])
        : emptyState('flame', 'Пока окон нет', kinds.every(kind => subscribed(city.id, kind))
          ? 'Как только появится новое окно, напишем в чат с ботом.'
          : 'Включите уведомления — напишем, как только появится новое окно.'),
    ];
  },

  // Окно: что, где, когда и за сколько; адрес и телефон — после подтверждения

  async window({ id }) {
    const data = await api(`windows/${id}`);
    const win = data.window;
    const venue = data.venue;
    const kind = kindOf(venue);
    const bookButton = h('button.btn', { onclick: () => startBooking(win, bookButton) }, `Забронировать за ${rub(win.price)}`);
    return [
      topbar(venue.name),
      h('.ticket-wrap', h('.card.ticket.floating',
        h('.ticket-top', h('.eyebrow', `${win.day} · ${win.time}`), win.discount > 0 && h('span.discount.big', `−${win.discount}%`)),
        h('.ticket-name', win.title),
        h('.row', icon('clock'), h('span', `${win.day}, ${win.time} · ${duration(win.minutes)}`)),
        h('.row', icon(kind.glyph), h('span', venue.name)),
        h('.row', icon('pin'), h('span', [venue.city, venue.district].filter(Boolean).join(', '))),
        h('.ticket-foot', h('span', 'Цена'), h('span.price-pair',
          win.old_price > win.price && h('s.old', rub(win.old_price)),
          h('span.price', rub(win.price)),
        )),
      )),
      venue.about && h('p.muted.rise', { i: 2, style: 'margin:16px 6px 0' }, venue.about),
      data.mine ? mineNote(data.mine) : data.available ? howItWorks(venue) : takenNote(),
      data.more.length > 0 && [
        h('h2.section.rise', { i: 4 }, 'Ещё окна здесь'),
        h('.stack', data.more.map((other, i) => windowCard({ ...other, venue }, i + 5, () => push('window', { id: other.id })))),
      ],
      !data.mine && data.available && h('.cta', h('.inner', bookButton)),
    ];
  },

  // Контакты при первой брони

  async contact({ win }) {
    const name = h('input', { type: 'text', autocomplete: 'given-name', maxLength: 60, value: state.boot.first_name || '' });
    const phone = h('input', { type: 'tel', autocomplete: 'tel', inputMode: 'tel', placeholder: '+7 900 123-45-67' });
    const consent = h('input', { type: 'checkbox' });
    const submit = h('button.btn', {
      onclick: () => {
        if (!name.value.trim()) return toast('Напишите, как к вам обращаться', 'error');
        // Как на сервере: от 10 цифр, а номер с кодом 7 — ровно 11
        const digits = phone.value.replace(/\D/g, '');
        if (digits.length < 10 || (digits[0] === '7' && digits.length !== 11)) return toast('Проверьте номер телефона', 'error');
        if (!consent.checked) return toast('Отметьте согласие — без него бронь не сохранится', 'error');
        book(win, { name: name.value.trim(), phone: phone.value.trim(), consent: true }, submit);
      },
    }, `Забронировать за ${rub(win.price)}`);
    return [
      topbar('Ваши контакты'),
      h('p.muted.rise', { i: 1, style: 'margin-bottom:16px' },
        'Спросим один раз. Имя и телефон увидит только заведение, в которое вы бронируете.'),
      h('.card.rise', { i: 2 },
        h('label.field', h('span', 'Имя'), name),
        h('label.field', h('span', 'Телефон'), phone),
        h('label.consent', consent, h('span', 'Согласен(на) на обработку имени и телефона для бронирования')),
      ),
      h('.cta', h('.inner', submit)),
    ];
  },

  async sent({ booking }) {
    document.body.classList.add('flow');
    const win = booking.window;
    const kind = kindOf(booking.venue);
    // Цвета искр — из темы в hot.css
    const colors = getComputedStyle(document.documentElement).getPropertyValue('--sparks').trim().split(/\s+/);
    return [
      h('.done-mark',
        h('.check', icon('check', 36)),
        Array.from({ length: 14 }, (_, i) => h('i.spark', {
          vars: { '--a': `${i * (360 / 14)}deg`, '--d': `${58 + (i % 3) * 16}px`, '--delay': `${280 + (i % 4) * 40}ms`, '--spark': colors[i % colors.length] },
        })),
      ),
      h('h1.title.center.rise', { i: 1 }, 'Бронь отправлена!'),
      h('p.lead.center.rise', { i: 2, style: 'margin-bottom:22px' },
        `${venueWord(booking.venue)} подтвердит её до ${booking.deadline} — пришлём сообщение в чат с ботом.`),
      h('.ticket-wrap', h('.card.ticket.floating',
        h('.eyebrow', 'Ждём подтверждения'),
        h('.ticket-name', win.title),
        h('.row', icon('calendar'), h('span', `${win.day}, ${win.time}`)),
        h('.row', icon(kind.glyph), h('span', booking.venue.name)),
        h('.row', icon('lock'), h('span', 'Адрес и телефон откроются после подтверждения')),
        h('.ticket-foot', h('span', 'Оплата на месте'), h('span.price', rub(win.price))),
      )),
      h('.rise', { i: 4, style: 'margin-top:24px' },
        h('button.btn', { onclick: () => resetTo('mine') }, 'Мои брони'),
        h('button.btn.link', { style: 'margin:8px auto 0;display:flex', onclick: () => resetTo('feed') }, 'Смотреть другие окна'),
      ),
    ];
  },

  async mine() {
    const list = await api('bookings');
    const title = h('h1.title.rise', { i: 0, style: 'margin-bottom:16px' }, 'Мои брони');
    if (!list.length) {
      return [title, emptyState('calendar', 'Броней пока нет', 'Выберите горящее окно — это займёт минуту.',
        h('button.btn', { style: 'margin-top:18px', onclick: () => resetTo('feed') }, 'Смотреть окна'))];
    }
    return [title, h('.stack', list.map((booking, i) => bookingCard(booking, i + 1)))];
  },

  // Кабинет: брони, которые ждут ответа, и окна каждого заведения; у администратора — все заведения и цифры

  async cabinet() {
    let data;
    try {
      data = await api('cabinet');
    } catch (error) {
      if (error.status !== 403) throw error;
      // Заведение передали другому аккаунту: убираем вкладку и уходим в каталог
      await refreshBoot(0).catch(() => {});
      toast('Кабинет открыт на другом аккаунте', 'error');
      resetTo('feed');
      return [];
    }
    state.cabinet = data;
    if (state.boot.pending !== data.pending.length) {
      state.boot.pending = data.pending.length;
      renderTabs();
    }
    let index = 2;
    return [
      h('.rise', { i: 0, style: 'margin-bottom:16px' },
        h('.eyebrow', data.is_admin ? 'Администратор платформы' : 'Кабинет заведения'),
        h('h1.title', 'Окна и брони')),
      data.stats && statsCard(data.stats),
      data.pending.length > 0 && [
        h('h2.section.rise', { i: index++ }, 'Ждут подтверждения'),
        h('.stack', data.pending.map((booking, n) => pendingCard(booking, n))),
      ],
      data.venues.map(venue => venueBlock(venue, index++, data.is_admin)),
      !data.venues.length && emptyState('spark', 'Заведений пока нет', 'Добавьте первую баню или мастера — и выставляйте окна.'),
      data.is_admin && h('.rise', { i: index++, style: 'margin-top:22px' },
        h('button.btn.ghost', { onclick: () => push('venueForm', {}) }, icon('plus', 20), 'Добавить заведение')),
    ];
  },

  // Новое окно: день, время, что продаём и за сколько. Начинаем с того, что выставляли в прошлый раз.

  async publish({ venueId }) {
    if (!state.cabinet || !state.cabinet.venues.some(v => v.id === venueId)) state.cabinet = await api('cabinet');
    const venue = state.cabinet.venues.find(v => v.id === venueId);
    if (!venue) throw new Error('Заведение не найдено');
    const sauna = venue.kind === 'sauna';
    const last = venue.last;
    const form = {
      date: isoDate(new Date()),
      // Название аренды подставляется по длительности, пока его не написали руками
      autoTitle: sauna && (!last || last.title === rentTitle(venue, minutesBetween(last.start, last.end))),
    };
    const start = h('input', { type: 'time', step: 900, value: last ? last.start : sauna ? '18:00' : '15:00' });
    const end = h('input', { type: 'time', step: 900, value: last ? last.end : sauna ? '21:00' : '16:00' });
    const title = h('input', { type: 'text', maxLength: 80, value: last ? last.title : '', placeholder: sauna ? rentTitle(venue, 180) : 'Маникюр с покрытием' });
    const price = h('input', { type: 'number', inputMode: 'numeric', min: 1, value: last ? last.price : '', placeholder: sauna ? '4800' : '1500' });
    const old = h('input', { type: 'number', inputMode: 'numeric', min: 1, value: last ? last.old_price : '', placeholder: sauna ? '6000' : '2000' });
    const hint = h('.form-hint');

    const update = () => {
      const minutes = minutesBetween(start.value, end.value);
      if (form.autoTitle && minutes) title.value = rentTitle(venue, minutes);
      const now = Number(price.value);
      const usual = Number(old.value);
      const parts = minutes ? [duration(minutes)] : [];
      if (now > 0 && usual > now) parts.push(' · скидка ', h('b', `${Math.round(100 - (now * 100) / usual)}%`));
      else if (now > 0 && usual > 0 && usual < now) parts.push(' · обычная цена ниже цены окна');
      hint.replaceChildren(...parts);
    };
    [start, end, price, old].forEach(input => input.addEventListener('input', update));
    title.addEventListener('input', () => { form.autoTitle = false; });
    update();

    const submit = h('button.btn', { onclick: send }, 'Выставить окно');
    async function send() {
      if (!title.value.trim()) return toast('Напишите, что продаёте: например, «Баня на 3 часа»', 'error');
      const now = Number(price.value);
      if (!(now > 0)) return toast('Укажите цену окна', 'error');
      submit.disabled = true;
      try {
        await api('cabinet/windows', {
          method: 'POST',
          body: {
            venue_id: venue.id,
            date: form.date,
            start: start.value,
            end: end.value,
            title: title.value.trim(),
            price: Math.round(now),
            old_price: Number(old.value) > 0 ? Math.round(Number(old.value)) : null,
          },
        });
      } catch (error) {
        submit.disabled = false;
        haptic('error');
        return toast(error.message, 'error');
      }
      haptic('success');
      toast('Окно выставлено — подписчики узнают о нём в течение минуты');
      state.cabinet = null;
      back();
    }

    const suggestions = sauna ? [120, 180, 240].map(minutes => rentTitle(venue, minutes)) : ['Маникюр с покрытием', 'Стрижка', 'Брови', 'Массаж'];
    return [
      topbar('Новое окно'),
      h('p.muted.rise', { i: 1, style: 'margin:-6px 4px 0' }, venue.name),
      dayStrip(nextDays(14), form.date, day => { form.date = day.date; }),
      h('.card.rise', { i: 2 },
        h('.two', h('label.field', h('span', 'С'), start), h('label.field', h('span', 'До'), end)),
        hint,
        h('label.field', { style: 'margin-top:14px' }, h('span', 'Что продаёте'), title),
        h('.suggest', suggestions.map(text => h('button', {
          type: 'button',
          onclick: () => { title.value = text; form.autoTitle = false; haptic('select'); },
        }, text))),
        h('.two', { style: 'margin-top:14px' },
          h('label.field', h('span', 'Цена окна, ₽'), price),
          h('label.field', h('span', 'Обычная цена, ₽'), old),
        ),
      ),
      h('p.muted.small.rise', { i: 3, style: 'margin:12px 6px 0' },
        'Скидка не обязательна, но окна со скидкой бронируют быстрее. Конец раньше начала — значит, окно заканчивается после полуночи.'),
      h('.cta', h('.inner', submit)),
    ];
  },

  // Заведение: новое или правка. Только у администратора.

  async venueForm({ venueId }) {
    if (!state.cabinet) state.cabinet = await api('cabinet');
    const venue = venueId ? state.cabinet.venues.find(v => v.id === venueId) : null;
    if (venueId && !venue) throw new Error('Заведение не найдено');
    let kind = venue ? venue.kind : 'sauna';
    const seg = h('.seg', Object.entries(KINDS).map(([key, info]) => h(`button${key === kind ? '.active' : ''}`, {
      type: 'button',
      onclick: event => {
        kind = key;
        seg.querySelectorAll('button').forEach(el => el.classList.toggle('active', el === event.currentTarget));
        haptic('select');
      },
    }, icon(info.glyph, 18), key === 'sauna' ? 'Баня или сауна' : 'Мастер красоты')));
    const city = h('select', state.boot.cities.map(c =>
      h('option', { value: c.id, selected: c.id === (venue ? venue.city_id : state.city) }, c.name)));
    const name = h('input', { type: 'text', maxLength: 80, value: venue ? venue.name : '', placeholder: 'Баня «Берёзка»' });
    const district = h('input', { type: 'text', maxLength: 80, value: venue ? venue.district : '', placeholder: 'Советский район' });
    const about = h('textarea', { maxLength: 500, value: venue ? venue.about : '', placeholder: 'Парная на дровах, купель, до 8 гостей' });
    const address = h('input', { type: 'text', maxLength: 200, value: venue ? venue.address : '', placeholder: 'ул. Садовая, 12' });
    const phone = h('input', { type: 'tel', maxLength: 40, value: venue ? venue.phone : '', placeholder: '+7 900 000-00-00' });
    const active = h('input', { type: 'checkbox', checked: venue ? venue.active : true });
    const field = (label, input) => h('label.field', h('span', label), input);

    const save = h('button.btn', { onclick: submit }, venue ? 'Сохранить' : 'Добавить заведение');
    async function submit() {
      if (!name.value.trim()) return toast('Напишите название', 'error');
      save.disabled = true;
      try {
        await api(venue ? `cabinet/venues/${venue.id}` : 'cabinet/venues', {
          method: 'POST',
          body: {
            kind,
            city_id: city.value,
            name: name.value.trim(),
            district: district.value.trim(),
            about: about.value.trim(),
            address: address.value.trim(),
            phone: phone.value.trim(),
            ...(venue ? { active: active.checked } : {}),
          },
        });
      } catch (error) {
        save.disabled = false;
        haptic('error');
        return toast(error.message, 'error');
      }
      haptic('success');
      toast(venue ? 'Сохранено' : 'Заведение добавлено — выставляйте окна');
      state.cabinet = null;
      back();
    }

    return [
      topbar(venue ? 'Заведение' : 'Новое заведение'),
      h('.card.rise', { i: 1 },
        seg,
        h('.form-section', 'Видят все'),
        field('Название', name),
        field('Город', city),
        field('Район или метро', district),
        field('О заведении', about),
        h('.form-section', 'Гость видит после подтверждения брони'),
        field('Адрес', address),
        field('Телефон', phone),
        venue && h('label.check-row', active, h('span', 'Заведение работает: его окна видны в каталоге')),
      ),
      h('.cta', h('.inner', save)),
    ];
  },
};

async function main() {
  await waitForTelegram(3000);
  // Вне Telegram (браузер, демо) скрипт есть, но кнопки и цвета ему недоступны
  const tg = nativeBack() ? sdk() : null;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      tg.setHeaderColor(bg);
      tg.setBackgroundColor(bg);
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    } catch {
      // старые версии Telegram не умеют красить шапку — это не мешает работе
    }
    tg.BackButton.onClick(back);
    tg.onEvent('activated', () => softRefresh());
  }
  if (demo) window.addEventListener('message', event => { if (event.data === 'refresh') softRefresh(); });

  try {
    await refreshBoot(0);
  } catch (error) {
    tabs.style.display = 'none';
    stage.replaceChildren(h('section.screen', h('.inner', h('.card.empty.rise',
      h('.empty-icon', icon('alert', 26)),
      h('p', error.message),
    ))));
    return;
  }

  state.city = pickCity();
  if (query.get('city') === state.city) setCity(state.city);
  const windowId = Number(query.get('w'));
  const venueId = Number(query.get('venue'));
  const screen = query.get('screen');
  if (Number.isSafeInteger(windowId) && windowId > 0) {
    // Окно из сообщения бота или из соцсетей — поверх каталога, чтобы «Назад» вёл туда
    state.tab = 'feed';
    state.stack = [{ name: 'feed' }];
    show({ name: 'window', params: { id: windowId } }, 'forward');
  } else if (screen === 'publish' && state.boot.is_staff && Number.isSafeInteger(venueId) && venueId > 0) {
    // «Другое время» из утреннего вопроса бота
    state.tab = 'cabinet';
    state.stack = [{ name: 'cabinet' }];
    show({ name: 'publish', params: { venueId } }, 'forward');
  } else {
    // Заведение по умолчанию попадает в кабинет, гость — в каталог
    const first = screen === 'mine' ? 'mine' : screen === 'feed' || !state.boot.is_staff ? 'feed' : 'cabinet';
    state.tab = first;
    show({ name: first }, 'tab');
  }
}

main();
