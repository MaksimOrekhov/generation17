import type { MomentDef } from './types'

const ONCE = Infinity

/**
 * Моменты по этапам жизни, профессиям и ответам на прошлые решения.
 * Основной каталог — в moments.ts; здесь то, что привязано к возрасту героя и накопленным флагам.
 */
export const extraMoments: MomentDef[] = [
  // — первые годы: события происходят вокруг героя, он только откликается —
  {
    id: 'm-lullaby', spot: 'parent', title: 'Колыбельная', min: 0, max: 3, weight: 3, cooldown: 1, needs: ['parent'],
    text: 'Мама укачивает тебя и тихо напевает мелодию без слов. За стеной ровно гудит вентиляция.',
    accept: { label: 'Прижаться и слушать', result: 'Мелодия смешивается с гулом корабля. Ты засыпаешь раньше, чем она заканчивается.', effects: { stats: { morale: 2, stress: -2 }, bonds: { parent: 4 } } },
    skip: { label: 'Отвернуться и хныкать' }
  },
  {
    id: 'm-dot-in-window', spot: 'window', title: 'Яркая точка', min: 0, max: 3, weight: 2, cooldown: 2, needs: ['parent'],
    text: '{{parent}} подносит тебя к обзорному стеклу и показывает на светящуюся точку: «Видишь? Нам туда».',
    accept: { label: 'Тянуться к стеклу', result: 'Точка не приближается, но ты долго не сводишь с неё глаз.', effects: { stats: { knowledge: 1, morale: 2 }, bonds: { parent: 2 } } },
    skip: { label: 'Смотреть на лампу' }
  },
  {
    id: 'm-first-steps', spot: 'parent', title: 'Первые шаги', min: 1, max: 2, weight: 5, cooldown: ONCE, needs: ['parent'],
    text: 'Ты держишься за край стола, а {{parent}} стоит в трёх шагах и протягивает руки. Ещё чуть-чуть.',
    accept: { label: 'Отпустить стол', result: 'Три шага, падение, смех. {{parent}} поднимает тебя так, будто это великое достижение.', effects: { stats: { morale: 3, knowledge: 1 }, bonds: { parent: 5 }, memory: 'Первые шаги: от стола к родителю.' } },
    skip: { label: 'Остаться у стола' }
  },
  {
    id: 'm-first-word', spot: 'table', title: 'Первое слово', min: 1, max: 3, weight: 4, cooldown: ONCE, needs: ['parent'],
    text: '{{parent}} в сотый раз повторяет одно и то же слово и показывает пальцем на чашку.',
    accept: { label: 'Сказать слово', result: 'Выходит что-то похожее. {{parent}} замирает, а потом звонко зовёт всех соседей.', effects: { stats: { knowledge: 2, morale: 3 }, bonds: { parent: 4 }, memory: 'Первое слово, которое взрослые потом пересказывали годами.' } },
    skip: { label: 'Промолчать' }
  },
  {
    id: 'm-bubbles', spot: 'table', title: 'Мыльные пузыри', min: 2, max: 6, weight: 2, cooldown: 3, needs: ['parent'],
    text: '{{parent}} выдувает над столом мыльные пузыри. Они плавно уходят вверх, подхваченные потоком вентиляции.',
    accept: { label: 'Ловить пузыри', result: 'Ни один не удаётся поймать, но смеяться хочется ещё и ещё.', effects: { stats: { morale: 3, stress: -1 }, bonds: { parent: 3 } } },
    skip: { label: 'Наблюдать' }
  },
  // — детство —
  {
    id: 'm-fogged-glass', spot: 'window', title: 'Запотевшее стекло', min: 4, max: 11, weight: 2, cooldown: 4,
    text: 'Обзорное стекло запотело изнутри. Если провести пальцем, получается прозрачная дорожка, а за ней — звёзды.',
    accept: { label: 'Нарисовать звезду', result: 'Ты рисуешь маленькую звезду. К утру она испаряется, а ты помнишь, где она была.', effects: { stats: { morale: 2, knowledge: 1 } } },
    skip: { label: 'Убежать' }
  },
  {
    id: 'm-snack', spot: 'table', title: 'Половина булки', min: 5, max: 14, weight: 3, cooldown: 4, needs: ['friend'],
    text: '{{friend}} достаёт из кармана булку, разламывает пополам и молча протягивает половину.',
    accept: { label: 'Взять предложенную половину', result: 'Булка тёплая и слегка помятая. Вы жуёте и обсуждаете, кто в классе странный.', effects: { stats: { morale: 2, bonds: 1 }, bonds: { friend: 4 } } },
    skip: { label: 'Отказаться из вежливости' }
  },
  {
    id: 'm-drawing', spot: 'table', title: 'Рисунок для своих', min: 4, max: 10, weight: 2, cooldown: 3, needs: ['parent'],
    text: 'На столе лежит чистый лист и огрызок карандаша. Вечер длинный, а {{parent}} как раз вернулась со смены.',
    accept: { label: 'Нарисовать корабль', result: 'Корабль получается кривым, с огромным окном. {{parent}} прикрепляет рисунок над кроватью.', effects: { stats: { morale: 2 }, bonds: { parent: 4 }, skills: { social: 1 } } },
    skip: { label: 'Заняться игрушками' }
  },
  {
    id: 'm-vent-echo', spot: 'door', title: 'Эхо в решётке', min: 7, max: 14, weight: 2, cooldown: 6,
    text: 'В технической нише у двери вентиляционная решётка отзывается эхом на любой шёпот. Кажется, в трубах кто-то есть.',
    accept: { label: 'Прошептать в решётку', result: 'Эхо возвращает слова чуть иначе. Ты уходишь, довольный тем, что корабль слышит.', effects: { stats: { morale: 2, knowledge: 1 } } },
    skip: { label: 'Пройти мимо' }
  },
  {
    id: 'm-quiz', spot: 'terminal', title: 'Школьная викторина', min: 8, max: 16, weight: 2, cooldown: 4,
    text: 'На терминале запускают викторину по устройству корабля. Победителю обещают дополнительную порцию сладкого.',
    accept: { label: 'Участвовать', result: 'Ты отвечаешь на половину вопросов и угадываешь ещё три. Сладкое достаётся другому, но голова полна новых фактов.', effects: { stats: { knowledge: 3, reputation: 1 } } },
    skip: { label: 'Смотреть со стороны' }
  },
  // — юность —
  {
    id: 'm-curfew', spot: 'door', title: 'Перед отбоем', min: 14, max: 19, weight: 3, cooldown: 4,
    text: 'Ты засидел{{hero:ся|ась}} в общей комнате после разговора и теперь возвращаешься домой: до отбоя двадцать минут, а до жилого сектора ещё длинный коридор. У поворота дежурит сотрудник. Можно срезать через служебный коридор мимо дежурного — рискнуть попасться, зато сократить путь, — или идти обычной дорогой и спокойно вернуться до отбоя.',
    accept: { label: 'Срезать через служебный коридор', result: 'Ты проскальзываешь мимо дежурного. Сердце колотится сильнее, чем должно.', effects: { stats: { stress: 2, morale: 3 } } },
    skip: { label: 'Идти обычной дорогой и успеть к отбою', effects: { stats: { reputation: 1 } } }
  },
  {
    id: 'm-radio-wall', spot: 'door', title: 'Музыка за стеной', min: 12, max: 45, weight: 2, cooldown: 5,
    text: 'Из-за стены доносится мелодия: кто-то из соседей собрал старый проигрыватель и теперь крутит одну и ту же запись.',
    accept: { label: 'Постучать и спросить', result: 'Это запись земного оркестра. Сосед обещает дать копию и поправить звук.', effects: { stats: { morale: 3, knowledge: 1, bonds: 1 } } },
    skip: { label: 'Слушать молча' }
  },
  // — профессии: у каждой своя повседневность —
  {
    id: 'm-job-tech', spot: 'terminal', title: 'Схема на терминале', min: 17, max: 65, weight: 3, cooldown: 3,
    available: g => g.protagonist.job === 'Техник',
    text: 'На терминале висит схема воздушного контура с устаревшими пометками. Можно обновить, пока нет срочных вызовов.',
    accept: { label: 'Свериться с реальностью', result: 'Три пометки оказались неверными. Теперь схема ближе к настоящему кораблю.', effects: { skills: { engineering: 2 }, stats: { knowledge: 1, reputation: 1 } } },
    skip: { label: 'Оставить как есть' }
  },
  {
    id: 'm-job-medic', spot: 'table', title: 'Карточки пациентов', min: 17, max: 65, weight: 3, cooldown: 3,
    available: g => g.protagonist.job === 'Медик',
    text: 'После смены остаётся стопка карточек: в паре из них есть детали, которые легко упустить.',
    accept: { label: 'Перечитать внимательно', result: 'В одной карточке находится несоответствие. Ничего страшного, но ты исправляешь запись.', effects: { skills: { medicine: 2 }, stats: { reputation: 1, stress: 1 } } },
    skip: { label: 'Сдать как есть' }
  },
  {
    id: 'm-job-agro', spot: 'plant', title: 'Новая грядка', min: 17, max: 65, weight: 3, cooldown: 3,
    available: g => g.protagonist.job === 'Агроном',
    text: 'В углу биокупола пустует грядка. Хватит света и воды на небольшой эксперимент.',
    accept: { label: 'Посадить что-нибудь', result: 'Через неделю появляются первые ростки. Не всё взойдёт, но и это знание.', effects: { skills: { ecology: 2 }, stats: { morale: 2 } } },
    skip: { label: 'Оставить пустой' }
  },
  {
    id: 'm-job-coord', spot: 'terminal', title: 'Спор в общем канале', min: 17, max: 65, weight: 3, cooldown: 3,
    available: g => g.protagonist.job === 'Координатор',
    text: 'Два сектора спорят в общем канале из-за графика уборки. Оба предлагают свои варианты и обвиняют друг друга.',
    accept: { label: 'Предложить компромисс', result: 'Через сутки обе стороны соглашаются на «пока что». Для корабля это почти мир.', effects: { skills: { social: 2 }, stats: { reputation: 2, stress: 1 } } },
    skip: { label: 'Не вмешиваться' }
  },
  // — взрослая жизнь —
  {
    id: 'm-coworker', spot: 'door', title: 'Приглашение на обед', min: 20, max: 62, weight: 2, cooldown: 4,
    text: 'Коллега из соседней смены стоит у двери: «Мы с ребятами идём на общую кухню. Пойдёшь?»',
    accept: { label: 'Пойти с ними', result: 'За обедом выясняется, что у вас много общего, начиная с нелюбви к одному начальнику.', effects: { stats: { bonds: 3, reputation: 1, morale: 2 } } },
    skip: { label: 'Сослаться на дела' }
  },
  {
    id: 'm-ration-queue', spot: 'door', title: 'Очередь за пайком', min: 18, max: 75, weight: 3, cooldown: 5,
    available: g => g.birth.wealth <= 2,
    text: 'В очереди за пайком пожилая соседка перебирает карманы. Не хватает пары талонов.',
    accept: { label: 'Отдать свои талоны', result: 'Ты урезаешь собственный ужин, но она до конца недели здоровается с улыбкой.', effects: { stats: { reputation: 2, bonds: 1, morale: 1, stress: 1 } } },
    skip: { label: 'Промолчать', effects: { stats: { stress: 1 } } }
  },
  {
    id: 'm-spare-ration', spot: 'table', title: 'Лишний паёк', min: 20, max: 75, weight: 3, cooldown: 6, needs: ['neighbor'],
    available: g => g.birth.wealth >= 4,
    text: 'В кладовой накопился лишний паёк. Через стену живёт {{neighbor}}, которому в этом цикле было непросто.',
    accept: { label: 'Отнести соседу', result: 'Вы оба делаете вид, что это пустяк. На самом деле это важно.', effects: { stats: { reputation: 2, morale: 2 }, bonds: { neighbor: 4 } } },
    skip: { label: 'Оставить себе' }
  },
  {
    id: 'm-night-deck', spot: 'window', title: 'Ночная палуба', min: 22, max: 60, weight: 2, cooldown: 4,
    text: 'После тяжёлой смены домой идти не хочется. На обзорной палубе в такой час пусто.',
    accept: { label: 'Выйти к стеклу', result: 'Ты стоишь там, пока не затекают ноги. Звёзды те же, а вот ты уже другой.', effects: { stats: { stress: -4, morale: 2 } } },
    skip: { label: 'Идти домой' }
  },
  {
    id: 'm-old-storyteller', spot: 'door', title: 'Рассказ старика', min: 25, max: 70, weight: 2, cooldown: 6,
    text: 'В атриуме на скамье сидит старик и рассказывает кому угодно, как строили второй жилой блок. Слушателей мало.',
    accept: { label: 'Присесть рядом', result: 'История оказывается длиннее, чем ждал{{hero:|а}}, и местами неправдоподобной. Но детали о первых годах полёта ты нигде не читал{{hero:|а}}.', effects: { stats: { knowledge: 2, morale: 1 } } },
    skip: { label: 'Пройти мимо' }
  },
  {
    id: 'm-garden-plot', spot: 'plant', title: 'Грядка в биокуполе', min: 20, max: 85, weight: 2, cooldown: 5,
    text: 'В общественном биокуполе освободился клочок земли. Всё, что нужно, — прийти и взяться руками.',
    accept: { label: 'Возиться в земле', result: 'К концу вечера руки в земле, на душе спокойнее, а в планах — что бы здесь посадить.', effects: { skills: { ecology: 1 }, stats: { stress: -3, morale: 2, health: 1 } } },
    skip: { label: 'Пройти мимо' }
  },
  // — поздние годы —
  {
    id: 'm-kids-stories', spot: 'door', title: 'Дети из соседнего блока', min: 55, max: 95, weight: 3, cooldown: 4,
    text: 'Двое детей заглядывают в твою каюту: «Говорят, вы помните, как было раньше. Расскажете?»',
    accept: { label: 'Пригласить и рассказать', result: 'Ты рассказываешь о вещах, которые давно считал{{hero:|а}} ерундой. Дети слушают так, будто это тайна.', effects: { stats: { morale: 3, reputation: 1, bonds: 2 } } },
    skip: { label: 'Сказать, что устал{{hero:|а}}' }
  },
  {
    id: 'm-old-photo', spot: 'table', title: 'Старый снимок', min: 55, max: 95, weight: 3, cooldown: ONCE,
    text: 'В ящике стола находится снимок, о существовании которого ты забыл{{hero:|а}}. Люди на нём почти все ушли.',
    accept: { label: 'Разглядеть как следует', result: 'Ты узнаёшь по именам почти всех, и на секунду все они снова здесь.', effects: { stats: { morale: 2, stress: -2, bonds: 1 }, memory: 'Наш{{hero:ёл|ла}} в столе старый снимок и вспомнил{{hero:|а}} всех, кто на нём.' } },
    skip: { label: 'Убрать обратно' }
  },
  {
    id: 'm-slow-walk', spot: 'window', title: 'Неспешная прогулка', min: 60, max: 95, weight: 3, cooldown: 3,
    text: 'Колени ноют, но кольцевой коридор по вечерам почти пуст, а у обзорного стекла есть скамья.',
    accept: { label: 'Пройтись до стекла', result: 'Дорога занимает вдвое больше времени, чем раньше. Зато спится потом хорошо.', effects: { stats: { health: 2, stress: -2, morale: 1 } } },
    skip: { label: 'Остаться дома' }
  },
  {
    id: 'm-student-call', spot: 'terminal', title: 'Звонок ученика', min: 50, max: 90, weight: 4, cooldown: 4,
    available: g => g.flags.mentored === true,
    text: 'На терминале появляется сообщение от бывшего ученика: «Хотел просто сказать, что вы были правы».',
    accept: { label: 'Ответить', result: 'Ответ получается длинным и тёплым. Ты давно не писал{{hero:|а}} так много.', effects: { stats: { morale: 4, reputation: 1 } } },
    skip: { label: 'Ответить позже' }
  },
  // — реакции на прошлые решения —
  {
    id: 'm-parent-thanks', spot: 'parent', title: 'Спасибо', min: 26, max: 70, weight: 4, cooldown: ONCE, needs: ['parent'],
    available: g => g.flags.parentHelped === true,
    text: '{{parent}} задерживает тебя на пороге и говорит то, о чём обычно молчат: что те месяцы, когда ты был рядом, значили очень много.',
    accept: { label: 'Обнять', result: 'Вы стоите так минуту. Потом {{parent}} машет рукой: «Ладно, хватит».', effects: { stats: { morale: 4, stress: -3 }, bonds: { parent: 6 } } },
    skip: { label: 'Отшутиться' }
  },
  {
    id: 'm-signal-rumor', spot: 'terminal', title: 'Разговор о сигнале', min: 22, max: 60, weight: 3, cooldown: ONCE,
    available: g => g.flags.heardSignal === true,
    text: 'Тот самый сигнал снова обсуждают в общем канале. Кто-то утверждает, что у него есть новая запись.',
    accept: { label: 'Присоединиться к обсуждению', result: 'Записи оказываются просто помехами. Но два человека предлагают вместе собирать архив.', effects: { stats: { knowledge: 2, bonds: 2 } } },
    skip: { label: 'Пролистать' }
  },
  {
    id: 'm-dome-free', spot: 'window', title: 'Очередь в купол', min: 25, max: 75, weight: 3, cooldown: ONCE,
    available: g => g.flags.freeDome === true,
    text: 'У входа в обзорный купол толпа молодёжи. Кто-то показывает на тебя: «Это {{hero:тот|та}}, кто выступал{{hero:|а}} против ограничений».',
    accept: { label: 'Подойти', result: 'Тебя засыпают вопросами, а потом приглашают постоять на лучших местах.', effects: { stats: { reputation: 3, morale: 2 } } },
    skip: { label: 'Пройти мимо' }
  },
  {
    id: 'm-dome-closed', spot: 'window', title: 'Закрытая дверь купола', min: 25, max: 75, weight: 3, cooldown: ONCE,
    available: g => g.flags.restrictedDome === true,
    text: 'Купол закрыт по новому графику. У двери кто-то бормочет, что «некоторые» ввели правила, не пострадав от них.',
    accept: { label: 'Объяснить причины', result: 'Объяснение выходит сухим, но спор постепенно стихает.', effects: { stats: { reputation: 1, stress: 2 }, skills: { social: 1 } } },
    skip: { label: 'Промолчать', effects: { stats: { reputation: -1 } } }
  },
  {
    id: 'm-reader-letter', spot: 'terminal', title: 'Письмо читателя', min: 24, max: 75, weight: 4, cooldown: ONCE,
    available: g => g.flags.publishedSignal === true,
    text: 'Незнакомый человек пишет по поводу твоей публикации о маяке: благодарит и приглашает в архивный кружок.',
    accept: { label: 'Принять приглашение', result: 'Кружок собирается по четвергам в тесной комнате архива. Людей мало, но споры настоящие.', effects: { stats: { knowledge: 2, bonds: 2, reputation: 2 } } },
    skip: { label: 'Поблагодарить и отказать' }
  },
  {
    id: 'm-first-supper', spot: 'table', title: 'Ужин в своей каюте', min: 18, max: 40, weight: 4, cooldown: ONCE,
    available: g => g.flags.movedOut === true,
    text: 'В своей каюте непривычно тихо. На столе — первый ужин, который ты приготовил{{hero:|а}} сам{{hero:|а}}.',
    accept: { label: 'Сесть и поесть', result: 'Ужин получился пересоленным. Но он твой, и за этим столом тебе никто не мешает.', effects: { stats: { morale: 3, stress: -2 } } },
    skip: { label: 'Пойти к семье', effects: { stats: { bonds: 1 } } }
  },
  {
    id: 'm-old-seeds', spot: 'plant', title: 'Росток из старых семян', min: 22, max: 80, weight: 4, cooldown: ONCE,
    available: g => g.flags.oldSeeds === true,
    text: 'На экспериментальной грядке пробился росток, которого не было в списках. Таких растений на корабле не видели десятилетия.',
    accept: { label: 'Присмотреть за ростком', result: 'Через месяц это уже заметный кустик. Название никто не знает, а запах напоминает чужую кухню.', effects: { skills: { ecology: 2 }, stats: { morale: 3, knowledge: 1 }, memory: 'Вырастил{{hero:|а}} кустик, которого не было на корабле десятилетиями.' } },
    skip: { label: 'Передать другим' }
  }
]
