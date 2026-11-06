'use strict';
// Кирпичики приложения «Горящие окна»: разметка, значки, всплывающие сообщения, запросы к серверу, шторки,
// переходы и лента дней. Они такие же, как в приложении бота мастера (проект beaty), поэтому оба выглядят и ведут себя одинаково.
// Экраны и навигация — в app.js.

const query = new URLSearchParams(location.search);
const demo = query.get('demo');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const API_URL = String(window.HOT_API_URL || '').replace(/\/+$/, '');

const stage = document.getElementById('stage');
const tabs = document.getElementById('tabs');

// Telegram

const sdk = () => window.Telegram && window.Telegram.WebApp;
// Своя кнопка «Назад» нужна, только если нет кнопки Telegram
const nativeBack = () => !!(sdk() && sdk().initData);

// Подпись берём у скрипта Telegram, а если он не загрузился — из адреса, куда её кладёт сам Telegram
function initData() {
  const fromSdk = sdk() && sdk().initData;
  if (fromSdk) return fromSdk;
  return new URLSearchParams(location.hash.slice(1)).get('tgWebAppData') || '';
}

function waitForTelegram(ms) {
  return new Promise(resolve => {
    const script = document.getElementById('tg-sdk');
    if (sdk() || !script || script.dataset.failed) return resolve();
    script.addEventListener('load', resolve);
    script.addEventListener('error', resolve);
    setTimeout(resolve, ms);
  });
}

function haptic(kind) {
  const feedback = nativeBack() && sdk().HapticFeedback;
  if (!feedback) return;
  if (kind === 'select') feedback.selectionChanged();
  else if (kind === 'success' || kind === 'error') feedback.notificationOccurred(kind);
  else feedback.impactOccurred('light');
}

// Ссылка в Telegram: внутри него — его же средствами, в браузере — в новой вкладке
function openLink(url) {
  if (nativeBack() && sdk().openTelegramLink && url.startsWith('https://t.me/')) sdk().openTelegramLink(url);
  else window.open(url, '_blank', 'noopener');
}

// Построение DOM: текст всегда идёт через text-узлы, поэтому названия и имена не могут стать разметкой

function h(tag, props, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  const isProps = props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props);
  if (isProps) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      // Дописываем, а не заменяем: порядок style и i в объекте не важен
      else if (key === 'style') el.style.cssText += `;${value}`;
      else if (key === 'i') el.style.setProperty('--i', value);
      else if (key === 'vars') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v);
      else if (key in el && key !== 'list') el[key] = value;
      else el.setAttribute(key, value);
    }
  } else if (props !== undefined) {
    kids.unshift(props);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  }
  return el;
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  arrow: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  spark: '<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="4.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone: '<path d="M6.5 3.5h3l1.5 5-2.2 1.6a12 12 0 0 0 5.1 5.1l1.6-2.2 5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13M12 16.5h.01"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  polish: '<path d="M10 2.5h4v5h-4z"/><path d="M8.5 7.5h7A2.5 2.5 0 0 1 18 10v8.5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V10a2.5 2.5 0 0 1 2.5-2.5z"/><path d="M9.5 14h5"/>',
  steam: '<path d="M7.5 19c-1.6-1.8 1.6-3.7 0-5.5s1.6-3.7 0-5.5"/><path d="M12 20.5c-1.6-1.8 1.6-3.7 0-5.5s1.6-3.7 0-5.5 1.6-3.7 0-5.5"/><path d="M16.5 19c-1.6-1.8 1.6-3.7 0-5.5s1.6-3.7 0-5.5"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.2 2.2-5.1 3.4-7.4.5 1.6 1.4 2.6 2.4 3.1-.3-3 1-6 3.2-7.9.4 2.9 1.4 4.4 2.6 6.1A7.6 7.6 0 0 1 18 15.2C18 18.5 15.6 21 12 21z"/><path d="M12 21c-1.5 0-2.6-1.1-2.6-2.6 0-1.7 1.3-2.6 2.1-3.9.9 1.3 3.1 2.2 3.1 3.9 0 1.5-1.1 2.6-2.6 2.6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1z"/>',
};

function icon(name, size = 22) {
  const span = document.createElement('span');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
  return span.firstChild;
}

const rub = n => `${Number(n).toLocaleString('ru-RU')} ₽`;

function plural(n, one, few, many) {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

// «45 мин», «1 час», «3 часа», «1 ч 30 мин»
function duration(minutes) {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
}

// Дата «2026-11-05» по часам телефона
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

// Память телефона: город и прочие мелочи. В приватном режиме её может не быть — тогда просто не запоминаем.
function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // без памяти приложение работает так же
  }
}

function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let toastTimer;
function toast(text, kind = 'ok') {
  const el = document.getElementById('toast');
  el.className = kind;
  el.replaceChildren(icon(kind === 'error' ? 'alert' : 'check', 20), h('span', text));
  clearTimeout(toastTimer);
  // Таймер — только после показа: в свёрнутом приложении кадр приходит позже, и тост остался бы на экране
  requestAnimationFrame(() => {
    el.classList.add('show');
    toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
  });
}

async function api(path, { method = 'GET', body } = {}) {
  if (!API_URL || API_URL.includes('PROJECT_REF')) {
    throw Object.assign(new Error('Приложение ещё не подключено к серверу: впишите адрес функции в config.js.'), { status: 0 });
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (demo) headers['X-Demo-User'] = demo;
  else headers['X-Telegram-Init-Data'] = initData();
  let response;
  try {
    response = await fetch(`${API_URL}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('Нет связи. Проверьте интернет и попробуйте ещё раз.'), { status: 0 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Что-то пошло не так'), { status: response.status });
  return data;
}

// Наклон карточки за пальцем или курсором

function tilt(el) {
  el.classList.add('tilt');
  if (reducedMotion) return el;
  const move = event => {
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 6}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 6}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
    el.style.setProperty('--glare', 1);
  };
  const reset = () => ['--rx', '--ry', '--glare'].forEach(name => el.style.removeProperty(name));
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', move);
  el.addEventListener('pointerleave', reset);
  el.addEventListener('pointerup', reset);
  el.addEventListener('pointercancel', reset);
  return el;
}

// Объёмный переход между экранами

const EASE = 'cubic-bezier(.22,.9,.24,1)';
const MOTION = {
  forward: {
    out: [{ transform: 'none', opacity: 1 }, { transform: 'translate3d(-18%,0,-150px) rotateY(9deg)', opacity: 0 }],
    in: [{ transform: 'translate3d(28%,0,-150px) rotateY(-12deg)', opacity: 0 }, { transform: 'none', opacity: 1 }],
  },
  back: {
    out: [{ transform: 'none', opacity: 1 }, { transform: 'translate3d(28%,0,-150px) rotateY(-12deg)', opacity: 0 }],
    in: [{ transform: 'translate3d(-18%,0,-150px) rotateY(9deg)', opacity: 0 }, { transform: 'none', opacity: 1 }],
  },
  tab: {
    out: [{ transform: 'none', opacity: 1 }, { transform: 'translateZ(-80px)', opacity: 0 }],
    in: [{ transform: 'translateZ(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
  },
};

function swapScreen(next, direction) {
  const previous = [...stage.children];
  stage.append(next);
  if (reducedMotion || !previous.length) {
    previous.forEach(el => el.remove());
    return;
  }
  const motion = MOTION[direction];
  previous.forEach(el => {
    el.style.pointerEvents = 'none';
    el.animate(motion.out, { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished
      .then(() => el.remove(), () => el.remove());
  });
  next.animate(motion.in, { duration: 560, easing: EASE });
}

function skeleton() {
  return h('.inner', h('.skeleton', { style: 'height:170px' }), h('.skeleton'), h('.skeleton'));
}

// Шторка снизу

function openSheet(build) {
  return new Promise(resolve => {
    const close = value => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 250);
      resolve(value);
    };
    const onKey = event => { if (event.key === 'Escape') close(null); };
    const sheet = h('.sheet', { role: 'dialog', 'aria-modal': 'true' });
    const overlay = h('.overlay', { onclick: event => { if (event.target === overlay) close(null); } }, sheet);
    sheet.append(...[build(close)].flat());
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
  });
}

function confirmSheet({ title, text, confirm, danger }) {
  return openSheet(close => [
    h('h2', title),
    h('p', text),
    h('.sheet-actions',
      h(`button.btn${danger ? '.danger' : ''}`, { onclick: () => close(true) }, confirm),
      h('button.btn.ghost', { onclick: () => close(false) }, 'Назад'),
    ),
  ]);
}

function emptyState(glyph, title, text, ...extra) {
  return h('.card.empty.rise', { i: 1 },
    h('.empty-icon', icon(glyph, 26)),
    h('.empty-title', title),
    text && h('p', text),
    extra,
  );
}

// Лента дней: days — [{ date, weekday, day, month, today, tomorrow }]

function dayStrip(days, selected, onPick) {
  const strip = h('.days.rise', { i: 1 }, days.map(day => h(`button.day${day.date === selected ? '.active' : ''}`, {
    onclick: click => {
      strip.querySelectorAll('.day').forEach(el => el.classList.toggle('active', el === click.currentTarget));
      haptic('select');
      onPick(day);
    },
  },
    h('span.day-week', day.today ? 'Сегодня' : day.tomorrow ? 'Завтра' : day.weekday),
    h('span.day-num', String(day.day)),
    h('span.day-month', day.month),
    h('span.day-dot'),
  )));
  requestAnimationFrame(() => {
    const active = strip.querySelector('.active');
    if (active) strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
  });
  return strip;
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Дни от сегодня по часам телефона — для ленты в форме окна
function nextDays(count) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = addDays(today, i);
    return { date: isoDate(d), weekday: WEEKDAYS[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()], today: i === 0, tomorrow: i === 1 };
  });
}
