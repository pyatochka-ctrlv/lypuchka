// Спільні дані: прийоми тиску, докази, персонажі.
// Липучка — вигаданий магніт-підковка, знайомий однолітка. Незнайомців і небезпечних ситуацій тут немає.

export const CHANNEL_NAME = "sprava-lypuchky";

// Кольори бренду (+ apricot для «Ти мені винен»: його немає в базовій палітрі).
export const COLORS = {
  "cobalt": "#2B4BF2", "cobalt-700": "#1C319D", "cobalt-100": "#D5DBFC",
  "sun": "#FFC629", "sun-100": "#FFF4D4", "ink": "#14161F", "ink-muted": "#5B6070",
  "paper": "#F3F4F7", "white": "#FFFFFF", "tomato": "#F0432E", "teal": "#14998F",
  "bubble": "#F5A9C6", "leaf": "#86B04A", "apricot": "#FFB98A"
};

export const TRICKS = [
  { id: "repeat", icon: "🔁", name: "Вмовляння",          color: "cobalt-100",
    how: "Повторює те саме знову й знову, поки ви не здастеся.",
    shield: "Моя відповідь — ні." },
  { id: "friend", icon: "🤝", name: "«Ти ж друг»",        color: "bubble",
    how: "Каже, що справжні друзі мають погоджуватися.",
    shield: "Я твій друг. І все одно — ні." },
  { id: "bribe",  icon: "🎁", name: "Підкуп",             color: "leaf",
    how: "Обіцяє щось приємне, щоб ви погодилися.",
    shield: "Ні, дякую. Мені це не потрібно." },
  { id: "all",    icon: "👥", name: "«Усі так роблять»",  color: "sun-100",
    how: "Каже, що всі вже погодились, тільки ви «не такі».",
    shield: "Можливо. А я — ні." },
  { id: "guilt",  icon: "🧾", name: "«Ти мені винен»",    color: "apricot",
    how: "Нагадує, що колись щось для вас зробив, і тепер вимагає.",
    shield: "Дякую, що тоді допоміг. Але зараз — ні." },
  { id: "threat", icon: "😤", name: "Образа або погроза", color: "tomato",
    how: "Ображається, лякає або обіцяє щось погане, якщо ви не погодитеся.",
    shield: "Мені шкода, що ти так кажеш. Але ні." }
];

export const EVIDENCE = [
  { id: 1, format: "speech", place: "🏫 Школа · Перерва біля шафок",
    context: "Завтра контрольна, а ви добре знаєте тему.",
    text: "Ну дай списати контрольну! Ну будь ласочка, ну будь ласочка, ну БУДЬ ЛАСОЧКА!",
    trick: "repeat", alsoOk: [],
    why: "Те саме прохання повторюється знову й знову, щоб ви втомилися й погодилися.",
    strong: ["Моя відповідь — ні.", "Ні. Можу пояснити тему на перерві."] },

  { id: 2, format: "note", place: "📝 Записка в пеналі",
    context: "Завтра екскурсія, і ви домовилися сидіти в автобусі біля вікна.",
    text: "Якщо ти справжній друг — віддаси мені місце біля вікна 😉",
    trick: "friend", alsoOk: [],
    why: "Дружбу ставлять умовою: «погодишся — значить, друг».",
    strong: ["Я твій друг. І все одно — ні.", "Ні. Можемо помінятися на зворотному шляху."] },

  { id: 3, format: "screenshot", place: "🎮 Чат у грі · Вечір",
    context: "Ви граєте з однокласниками. У вас прокачаний акаунт.",
    text: "Скинь свій пароль — я тобі легендарний скін подарую 🎁",
    trick: "bribe", alsoOk: [],
    why: "Обіцянка подарунка, щоб ви віддали те, що віддавати не можна.",
    strong: ["Ні, дякую. Пароль я нікому не даю.", "Ні. Скін мені не потрібен."] },

  { id: 4, format: "voice", place: "🌳 Двір · Після уроків", duration: "0:07",
    context: "Сьогодні у вас гурток, який вам подобається.",
    text: "Та всі сьогодні прогулюють гурток! Тільки ти як відмінник, ха-ха!",
    trick: "all", alsoOk: ["threat"],
    why: "«Усі так роблять» — і ви ніби «не такі», якщо не погоджуєтеся.",
    strong: ["Можливо. А я — ні.", "Ні, я йду на гурток."] },

  { id: 5, format: "call", place: "🏠 Вдома · Дзвінок у суботу",
    context: "Тиждень тому Липучка позичила вам зарядку.",
    text: "Я ж тобі в понеділок давав зарядку! Тепер ти мені винен — дай свою приставку на всі вихідні.",
    trick: "guilt", alsoOk: [],
    why: "Маленьку колишню послугу обмінюють на велике прохання: «ти мені винен».",
    strong: ["Дякую, що тоді допоміг. Але приставку — ні.", "Ні. Можемо пограти разом у мене."] },

  { id: 6, format: "comment", place: "💬 Коментар у чаті класу",
    context: "Ви відмовилися дати Липучці списати домашку.",
    text: "Не даси списати — всім розкажу, що ти досі спиш з плюшевим зайцем 😈",
    trick: "threat", alsoOk: [],
    why: "Лякає, що станеться щось неприємне, якщо ви не погодитеся.",
    strong: ["Мені шкода, що ти так кажеш. Але ні.", "Ні. Розказуй, мені не соромно."],
    trainerNote: "Якщо погрози не припиняються або лякають — про це варто сказати дорослому. Детальніше — на наступному слайді уроку." },

  { id: 7, format: "speech", place: "🏫 Їдальня", combo: true,
    context: "У вас на тарілці остання піца, і ви голодні.",
    text: "Ну ти ж мій найкращий друг! Усі ж діляться! Ну будь ласочка, ну будь ласочка!",
    trick: "friend", alsoOk: ["all", "repeat"],
    comboTricks: ["friend", "all", "repeat"],
    why: "КОМБО! Липучка поєднала одразу три прийоми.",
    strong: ["Я твій друг. Але піцу — ні.", "Моя відповідь — ні."] }
];

export const INTRO_READ = "Увага, суд іде! Липучку звинувачують у тиску: вона прилипає з проханнями й не чує «ні». Ви — слідчі. Визначте прийом у кожному доказі й дайте Липучці відповідь-щит.";
export const VERDICT_READ = "Суд розглянув справу Липучки. Слідчі викрили всі прийоми тиску. Вирок: прийоми Липучки викрито — вони більше не діють! Липучко, відклеюйся!";
export const REMINDER = "Липучка не сперечається — тиск не логіка, його не перемагають аргументами.";

export const trickById = id => TRICKS.find(t => t.id === id);
export const colorOf = trick => COLORS[trick.color] || COLORS["cobalt-100"];
export const isHit = (ev, id) => ev.trick === id || ev.alsoOk.includes(id);

// Липучка: магніт-підковка з очима й руками (tomato + cobalt).
export function magnetSVG(mood = "guilty") {
  const mouths = {
    guilty: '<path d="M62 45 q4 -4 8 0 q4 4 8 0" stroke="#14161F" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    happy:  '<path d="M61 42 q9 10 18 0 z" fill="#14161F"/>',
    sad:    '<path d="M63 48 q7 -6 14 0" stroke="#14161F" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
  };
  const sweat = mood === "happy" ? "" : '<path class="sweat" d="M108 22 q6 10 0 14 q-6 -4 0 -14z" fill="#D5DBFC" stroke="#2B4BF2" stroke-width="2"/>';
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M38 104 V66 a32 32 0 0 1 64 0 V104" stroke="#F0432E" stroke-width="30" fill="none"/>
  <path d="M46 62 a24 24 0 0 1 12 -18" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="23" y="100" width="30" height="24" rx="5" fill="#2B4BF2"/>
  <rect x="87" y="100" width="30" height="24" rx="5" fill="#2B4BF2"/>
  <rect x="27" y="104" width="7" height="16" rx="3" fill="#FFFFFF" fill-opacity=".35"/>
  <path d="M24 80 L10 94" stroke="#1C319D" stroke-width="5" stroke-linecap="round"/><circle cx="9" cy="95" r="6.5" fill="#1C319D"/>
  <path d="M116 80 L130 94" stroke="#1C319D" stroke-width="5" stroke-linecap="round"/><circle cx="131" cy="95" r="6.5" fill="#1C319D"/>
  <circle cx="58" cy="31" r="8.5" fill="#FFFFFF"/><circle cx="82" cy="31" r="8.5" fill="#FFFFFF"/>
  <circle cx="${mood === "guilty" ? 56 : 58}" cy="33" r="4.2" fill="#14161F"/><circle cx="${mood === "guilty" ? 80 : 82}" cy="33" r="4.2" fill="#14161F"/>
  ${mood === "guilty" ? '<path d="M50 20 l14 4 M90 20 l-14 4" stroke="#14161F" stroke-width="3" stroke-linecap="round"/>' : ""}
  <circle cx="49" cy="43" r="4" fill="#F5A9C6"/><circle cx="91" cy="43" r="4" fill="#F5A9C6"/>
  ${mouths[mood] || mouths.guilty}
  ${sweat}
</svg>`;
}

// Сова-суддя в мантії з молотком.
export function owlSVG() {
  return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M40 120 Q100 90 160 120 L176 214 H24 Z" fill="#14161F"/>
  <path d="M82 112 L100 150 L118 112 Z" fill="#FFFFFF"/>
  <path d="M100 118 v40" stroke="#D5DBFC" stroke-width="3"/>
  <ellipse cx="100" cy="74" rx="66" ry="58" fill="#1C319D"/>
  <path d="M42 34 L56 52 L64 28 Z M158 34 L144 52 L136 28 Z" fill="#1C319D"/>
  <ellipse cx="100" cy="80" rx="52" ry="42" fill="#FFF4D4"/>
  <circle cx="76" cy="74" r="20" fill="#FFFFFF" stroke="#1C319D" stroke-width="4"/>
  <circle cx="124" cy="74" r="20" fill="#FFFFFF" stroke="#1C319D" stroke-width="4"/>
  <circle cx="78" cy="76" r="9" fill="#14161F"/><circle cx="122" cy="76" r="9" fill="#14161F"/>
  <circle cx="81" cy="72" r="3" fill="#FFFFFF"/><circle cx="125" cy="72" r="3" fill="#FFFFFF"/>
  <path d="M60 50 q16 -8 30 2 M140 50 q-16 -8 -30 2" stroke="#14161F" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M92 94 L100 110 L108 94 Z" fill="#FFC629"/>
  <rect x="62" y="6" width="76" height="16" rx="4" fill="#14161F"/><rect x="88" y="0" width="24" height="10" rx="3" fill="#14161F"/>
</svg>`;
}

export function gavelSVG() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="52" y="40" width="12" height="74" rx="6" fill="#FFC629" stroke="#14161F" stroke-width="3"/>
  <rect x="22" y="14" width="72" height="34" rx="10" fill="#1C319D" stroke="#14161F" stroke-width="3"/>
  <rect x="16" y="18" width="12" height="26" rx="4" fill="#FFC629"/><rect x="88" y="18" width="12" height="26" rx="4" fill="#FFC629"/>
</svg>`;
}
