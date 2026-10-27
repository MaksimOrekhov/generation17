import type { Storylet } from './types'
import { extraStorylets } from './storyletsExtra'
import { arcStorylets } from './storyletsArcs'
import { lineStorylets } from './storyletsLines'
import { mysteryStorylets } from './storyletsMystery'
import { compileStorylet } from '../content/load'
import bundle from '../content/bundle.json'
import type { ContentBundle } from '../content/types'

const any = () => true
import { gYearPlaceholder } from './constants'
export { gYearPlaceholder }

// Небольшой ручной каталог. Важнее связанные последствия, чем количество событий.
// Каждое событие одноразовое; world/relationship flags позволяют реакциям проявляться позже.
const baseStorylets: Storylet[] = [
  {
    id: 'child-window', category: 'Детство', min: 6, max: 11, weight: 3,
    title: 'Окно в пустоту',
    body: 'Впервые оказавшись у обзорного стекла, ты видишь звёзды без учебных схем и подписей. {{friend}} шепчет, что однажды найдёт настоящую Землю. Ты замечаешь, что взрослые вокруг молчат.',
    available: any,
    choices: [
      { text: 'Спросить, куда летит корабль', hint: 'Знания ↑ · Любопытство', result: 'Ты начинаешь собирать любые истории о пункте назначения.', effects: { stats: { knowledge: 5 }, skills: { social: 1 }, flags: { destinationCurious: true }, memory: 'Впервые увидел бездну космоса за стеклом.' } },
      { text: 'Остаться рядом с другом', hint: 'Связи ↑ · Счастье ↑', result: 'Вы придумываете собственные созвездия. У этой игры появляется тайное имя.', effects: { stats: { bonds: 4, morale: 4 }, bonds: { friend: 7 }, memory: 'Придумывал созвездия вместе с другом.' } },
      { text: 'Вернуться к привычным коридорам', hint: 'Спокойствие ↑', result: 'Тебе уютнее там, где слышно людей и вентиляцию.', effects: { stats: { stress: -3, morale: 2 } } }
    ]
  },
  {
    id: 'child-library', category: 'Детство', min: 7, max: 15, weight: 2,
    title: 'Закрытый архив', body: 'Школьный терминал случайно открывает устаревшую запись с Земли: дождь над океаном. Учитель просит закрыть файл, пока не пришёл администратор.', available: any,
    choices: [
      { text: 'Сохранить запись', hint: 'Знания ↑ · Риск', result: 'Ты прячешь копию среди домашних заданий.', effects: { stats: { knowledge: 5, stress: 2 }, flags: { archiveCopy: true }, memory: 'Тайком сохранил архивную запись земного дождя.' } },
      { text: 'Спросить учителя, почему запись закрыта', hint: 'Знания ↑ · Отношение взрослых', result: 'Учитель отвечает не сразу. Некоторые вещи, говорит он, слишком легко принять за обещание.', effects: { stats: { knowledge: 3 }, skills: { social: 2 } } },
      { text: 'Забыть об этом', hint: 'Меньше тревоги', result: 'Звук дождя ещё долго всплывает во сне, но ты не ищешь объяснений.', effects: { stats: { stress: -2 } } }
    ]
  },
  {
    id: 'friend-accusation', arc: 'friend', fork: true, category: 'Отношения', min: 9, max: 18, weight: 3,
    title: 'Обвинение', body: '{{friend}} обвиняют в порче школьного очистителя воды. Ты видел, что прибор был неисправен ещё вчера, но взрослые уже нашли виноватого.', available: any,
    choices: [
      { text: 'Заступиться публично', hint: 'Дружба ↑ · Репутация ↕', result: 'Ты говоришь то, что видел. Не все верят, но друг не остаётся один.', effects: { stats: { bonds: 4, reputation: -1 }, bonds: { friend: 15 }, flags: { stoodForFriend: true }, memory: 'Заступился за друга, когда его обвинили без доказательств.' } },
      { text: 'Поговорить с учителем наедине', hint: 'Осторожный путь', result: 'Разговор остаётся между вами, но проверку всё же начинают.', effects: { stats: { reputation: 2 }, bonds: { friend: 4 }, flags: { quietWitness: true } } },
      { text: 'Не вмешиваться', hint: 'Риск ↓ · Доверие ↓', result: 'Через неделю обвинение снимают. Друг запоминает, что ты промолчал.', effects: { stats: { stress: -2, bonds: -3 }, bonds: { friend: -14 }, flags: { abandonedFriend: true } } }
    ]
  },
  {
    id: 'home-repair', category: 'Семья', min: 10, max: 19, weight: 2,
    title: 'Сломанная система отопления', body: 'В семейном жилом блоке внезапно отключается отопление. Ремонтная бригада обещает прийти через неделю; {{parent}} пытается отогреть трубы подручными средствами.', available: any,
    choices: [
      { text: 'Помогать разбираться с устройством', hint: 'Инженерия ↑ · Стресс ↑', result: 'Работаете до ночи и находите неисправный датчик.', effects: { skills: { engineering: 6 }, stats: { knowledge: 2, stress: 3 }, bonds: { parent: 5 } } },
      { text: 'Попросить помощи у соседей', hint: 'Связи ↑', result: 'Соседи приносят обогреватель и инструменты.', effects: { skills: { social: 3 }, stats: { bonds: 4 }, bonds: { parent: 5 } } },
      { text: 'Остаться в школе подольше', hint: 'Знания ↑ · Семья ↓', result: 'Там тепло. Дома тебя встречают усталые лица.', effects: { stats: { knowledge: 3, bonds: -2 }, bonds: { parent: -4 } } }
    ]
  },
  {
    id: 'school-track', arc: 'career', fork: true, category: 'Профессия', min: 16, max: 17, weight: 10,
    title: 'Распределение по специальностям', body: 'Комиссия предлагает четыре направления. От этого решения зависит, какие двери будут открыты следующие годы. Никто не обещает, что выбор окончательный.', available: g => !g.flags.trackChosen,
    choices: [
      { text: 'Инженерные системы', hint: 'Техническая работа · Инженерия ↑', result: 'Тебя направляют в технический корпус. За стенами мастерских непрерывно работает сердце корабля.', effects: { job: 'Техник', skills: { engineering: 12 }, flags: { trackChosen: true }, memory: 'Выбрал инженерное дело.' } },
      { text: 'Медицинская служба', hint: 'Здоровье людей · Медицина ↑', result: 'Ты начинаешь учиться в клиническом блоке, где каждый день встречают десятки разных судеб.', effects: { job: 'Медик', skills: { medicine: 12 }, flags: { trackChosen: true }, memory: 'Выбрал медицинскую службу.' } },
      { text: 'Биокупол и агрономия', hint: 'Растения · Экология ↑', result: 'Впервые за долгое время ты проводишь целый рабочий день среди деревьев и запаха влажной почвы.', effects: { job: 'Агроном', skills: { ecology: 12 }, flags: { trackChosen: true }, memory: 'Выбрал работу в биокуполе.' } },
      { text: 'Администрация и коммуникации', hint: 'Общество · Коммуникация ↑', result: 'Тебе достаются протоколы, конфликты, переговоры и сложные решения, которые редко бывают единственно верными.', effects: { job: 'Координатор', skills: { social: 12 }, flags: { trackChosen: true }, memory: 'Выбрал административную работу.' } }
    ]
  },
  {
    id: 'first-pay', category: 'Профессия', min: 18, max: 27, weight: 2,
    title: 'Первое самостоятельное назначение', body: 'Тебе предлагают смену в секторе вдали от семьи. Дополнительные привилегии невелики, но можно наконец съехать из общего жилого блока.', available: g => !!g.flags.trackChosen,
    choices: [
      { text: 'Согласиться на перевод', hint: 'Карьера ↑ · Близость с семьёй ↓', result: 'Крошечная личная каюта кажется огромной, пока не наступает первая одинокая ночь.', effects: { stats: { reputation: 7, bonds: -4, morale: 2 }, flags: { movedOut: true }, memory: 'Впервые переехал от семьи.' } },
      { text: 'Остаться рядом с семьёй', hint: 'Отношения ↑ · Карьера ↔', result: 'Дни остаются предсказуемыми. По вечерам вы всё ещё ужинаете вместе.', effects: { stats: { bonds: 5, morale: 2 }, bonds: { parent: 5 } } },
      { text: 'Попросить другую должность', hint: 'Репутация ↕ · Риск', result: 'Руководитель обещает подумать, но на ближайшие месяцы тебя исключают из списка переводов.', effects: { stats: { stress: 3, reputation: -2 }, skills: { social: 3 } } }
    ]
  },
  {
    id: 'signal', arc: 'signal', fork: true, category: 'Тайна', min: 20, max: 55, weight: 1.5,
    title: 'Повторяющийся сигнал', body: 'В жилой сети распространяется запись странного сигнала. Одни считают его техническими помехами, другие уверены, что это сообщение из пункта назначения.', available: g => !g.flags.signalInvestigated && (g.flags.destinationCurious === true || g.flags.archiveCopy === true),
    choices: [
      { text: 'Изучить запись', hint: 'Знания ↑ · Новая линия событий', result: 'Ты замечаешь, что запись содержит старый бортовой идентификатор.', effects: { stats: { knowledge: 5 }, flags: { signalInvestigated: gYearPlaceholder, signalAge: gYearPlaceholder }, memory: 'Начал исследовать загадочный радиосигнал.' } },
      { text: 'Обсудить с друзьями', hint: 'Связи ↑', result: 'Обсуждение переходит от сигнала к истории корабля и вере в миссию.', effects: { stats: { bonds: 4 }, skills: { social: 2 }, flags: { heardSignal: true, signalAge: gYearPlaceholder } } },
      { text: 'Игнорировать сенсацию', hint: 'Стресс ↓', result: 'Ты не участвуешь в спорах. Через несколько недель о записи говорят уже реже.', effects: { stats: { stress: -3 }, flags: { ignoredSignal: true, signalAge: gYearPlaceholder } } }
    ]
  },
  {
    id: 'microcrack', arc: 'crack', fork: true, category: 'Профессия', min: 22, max: 58, weight: 3,
    title: 'Незарегистрированная трещина', body: 'Во время обследования соседнего отсека ты замечаешь микротрещину в воздушном контуре. Начальник уверяет, что риска нет, и просит не открывать официальный протокол.', available: g => g.protagonist.job === 'Техник' && !g.flags.leakChoice,
    choices: [
      { text: 'Подать официальный рапорт', hint: 'Репутация ↕ · Возможные последствия позже', result: 'Рапорт принят под номером 81-C. Начальник теперь разговаривает с тобой подчёркнуто официально.', effects: { stats: { reputation: -2, stress: 3 }, skills: { engineering: 3 }, flags: { leakChoice: 'report', leakAge: gYearPlaceholder }, memory: 'Не побоялся подать рапорт о повреждении воздушного контура.' } },
      { text: 'Попробовать устранить проблему', hint: 'Риск · Инженерия', result: 'Ты остаёшься после смены и открываешь техническую панель.', effects: { stats: { stress: 4 }, flags: { leakChoice: 'repair', leakAge: gYearPlaceholder } }, check: { skill: 'engineering', difficulty: 24, successText: 'Сложный ремонт удался. Датчики показывают стабильное давление.', failureText: 'Устранить трещину не удалось. Теперь часть креплений повреждена.', success: { skills: { engineering: 7 }, ship: { air: 3 }, flags: { leakRepaired: true } }, failure: { ship: { air: -5 }, stats: { health: -3, stress: 5 }, flags: { leakRepaired: false } } } },
      { text: 'Согласиться с начальником', hint: 'Стабильность карьеры · Скрытый риск', result: 'Вы закрываете инспекцию. Через несколько дней всё забывается.', effects: { stats: { reputation: 2, stress: -2 }, flags: { leakChoice: 'silent', leakAge: gYearPlaceholder } } }
    ]
  },
  {
    id: 'clinic', category: 'Профессия', min: 20, max: 55, weight: 3,
    title: 'Последняя свободная палата', body: 'В медблок одновременно доставляют двоих пациентов. Одному помощь требуется немедленно, другой — родственник влиятельного администратора. Коллега спрашивает твоего совета.', available: g => g.protagonist.job === 'Медик',
    choices: [
      { text: 'Опираться только на медицинские показания', hint: 'Репутация ↑ · Конфликт', result: 'Врачебный протокол соблюдён. Жалоба от администрации приходит уже утром.', effects: { skills: { medicine: 5 }, stats: { reputation: 5, stress: 4 }, flags: { medicalIntegrity: true } } },
      { text: 'Найти временное решение для обоих', hint: 'Риск · Медицина', result: 'Ты организуешь временное место в соседнем кабинете.', effects: { stats: { stress: 3 }, skills: { medicine: 2 } }, check: { skill: 'medicine', difficulty: 23, successText: 'Обоим пациентам удаётся помочь.', failureText: 'Ты не справляешься с нагрузкой, и ситуация осложняется.', success: { stats: { reputation: 6, morale: 5 } }, failure: { stats: { morale: -6, stress: 8 } } } },
      { text: 'Не вмешиваться в распределение', hint: 'Стресс ↓ · Репутация ↔', result: 'Решение принимает старший врач. Тебя оно не устраивает, но жалобы ты не подаёшь.', effects: { stats: { stress: -1, morale: -3 } } }
    ]
  },
  {
    id: 'seed-vault', category: 'Профессия', min: 21, max: 55, weight: 3,
    title: 'Коллекция семян', body: 'В агрономическом архиве находят капсулы с семенами земных растений. Их можно выращивать для эксперимента, но придётся потратить часть ограниченного запаса воды.', available: g => g.protagonist.job === 'Агроном',
    choices: [
      { text: 'Подготовить эксперимент', hint: 'Экология ↑ · Вода ↓', result: 'В биокуполе появляется крохотная опытная грядка. Каждый новый лист радует сильнее, чем должен.', effects: { skills: { ecology: 7 }, ship: { food: -3 }, flags: { oldSeeds: true }, memory: 'Вырастил растения из довоенного банка семян.' } },
      { text: 'Сохранить семена до прибытия', hint: 'Ресурсы сохранены', result: 'Ты закрываешь контейнер в архиве. Кто-то другой когда-нибудь узнает, что из него могло вырасти.', effects: { ship: { food: 1 }, stats: { knowledge: 2 } } },
      { text: 'Передать находку исследовательскому совету', hint: 'Карьера ↑', result: 'Исследовательский совет берёт образцы на анализ.', effects: { stats: { reputation: 5 }, skills: { ecology: 2 } } }
    ]
  },
  {
    id: 'council', category: 'Общество', min: 22, max: 62, weight: 3,
    title: 'Новый порядок доступа', body: 'Совет предлагает ограничить доступ в обзорный купол: якобы посещения расходуют слишком много энергии. Общественный канал разделяется на два лагеря.', available: g => g.protagonist.job === 'Координатор',
    choices: [
      { text: 'Предложить прозрачную систему квот', hint: 'Коммуникация ↑ · Единство ↑', result: 'Твоё предложение не устраивает всех, но спор впервые становится предметным.', effects: { skills: { social: 5 }, ship: { cohesion: 3 }, stats: { reputation: 5 } } },
      { text: 'Поддержать полный запрет', hint: 'Энергия ↑ · Единство ↓', result: 'Новые правила экономят энергию, но люди всё чаще называют обзорный купол привилегией.', effects: { ship: { air: 1, cohesion: -6 }, stats: { reputation: 3 }, flags: { restrictedDome: true } } },
      { text: 'Выступить против ограничений', hint: 'Репутация ↕ · Единство', result: 'Тебя поддерживают молодые жители, но инженерный корпус не скрывает раздражения.', effects: { ship: { cohesion: 1 }, stats: { reputation: -2, bonds: 3 }, flags: { freeDome: true } } }
    ]
  },
  {
    id: 'relationship', arc: 'love', fork: true, category: 'Отношения', min: 18, max: 42, weight: 3,
    title: 'Неожиданная близость', body: 'После общего праздника {{friend}} остаётся с тобой на пустой смотровой палубе. Вы много лет знакомы, но сегодня разговор кажется совсем другим.', available: g => g.people.some(p => p.id === 'friend' && p.bond >= 35) && g.flags.friendState !== 'estranged' && !g.flags.relationshipTalk,
    choices: [
      { text: 'Признаться в своих чувствах', hint: 'Шанс на близость · Уязвимость', result: 'Ты говоришь то, что давно не решался. Ответ не приходит мгновенно, но между вами возникает новая честность.', effects: { stats: { bonds: 7, morale: 4 }, bonds: { friend: 10 }, flags: { relationshipTalk: true, closeRelationship: true, lovePath: 'confessed', loveAge: gYearPlaceholder }, memory: 'Признался близкому человеку в чувствах.' } },
      { text: 'Остаться просто друзьями', hint: 'Дружба ↑', result: 'Вы ещё долго наблюдаете, как за стеклом проплывают холодные звёзды.', effects: { stats: { bonds: 3 }, bonds: { friend: 4 }, flags: { relationshipTalk: true, lovePath: 'friends', loveAge: gYearPlaceholder }, memory: 'Провёл незабываемую ночь у обзорного купола.' } },
      { text: 'Сменить тему', hint: 'Риск ↓', result: 'Момент проходит. Ты не знаешь, можно ли будет к нему вернуться.', effects: { stats: { stress: -1 }, flags: { relationshipTalk: true, lovePath: 'skipped', loveAge: gYearPlaceholder } } }
    ]
  },
  {
    id: 'parent-illness', arc: 'parent', fork: true, category: 'Семья', min: 25, max: 57, weight: 2,
    title: 'Неожиданный диагноз', body: '{{parent}} сообщает, что медики обнаружили заболевание, требующее длительного лечения. Это не обязательно смертельно, но впереди много неизвестности.', available: g => !g.flags.parentIll && g.flags.familyHealthRisk === true,
    choices: [
      { text: 'Перестроить расписание и помогать', hint: 'Семья ↑ · Карьера ↓', result: 'Вы проводите больше времени вместе. Некоторые разговоры давно стоило начать.', effects: { stats: { bonds: 7, reputation: -2, stress: 5 }, bonds: { parent: 13 }, flags: { parentIll: true, parentHelped: true, parentCare: 'close', parentAge: gYearPlaceholder }, memory: 'Заботился о заболевшем родителе.' } },
      { text: 'Найти дополнительные медицинские ресурсы', hint: 'Медицина ↑ · Репутация ↕', result: 'Ты ищешь врачей, разъяснения и доступные программы поддержки.', effects: { skills: { medicine: 4 }, stats: { stress: 6 }, flags: { parentIll: true, parentHelped: true, parentCare: 'medical', parentAge: gYearPlaceholder } } },
      { text: 'Ограничиться редкими визитами', hint: 'Стресс ↓ · Близость ↓', result: 'Вы общаетесь по сети. Иногда тебе кажется, что сообщения стали короче.', effects: { stats: { stress: -2, bonds: -4 }, bonds: { parent: -10 }, flags: { parentIll: true, parentCare: 'distant', parentAge: gYearPlaceholder } } }
    ]
  },
  {
    id: 'water-shortage', category: 'Корабль', min: 18, max: 76, weight: 2,
    title: 'Нормирование воды', body: 'Из-за отклонения в цикле переработки администрация вводит временные ограничения. В очередях растёт раздражение, хотя аварийный резерв пока цел.', available: g => g.ship.food < 80 && !g.flags.waterChoice,
    choices: [
      { text: 'Присоединиться к волонтёрам', hint: 'Общество ↑ · Стресс ↑', result: 'Ты помогаешь распределять воду. Люди злятся, но благодарят за понятные объяснения.', effects: { stats: { bonds: 4, reputation: 5, stress: 4 }, ship: { cohesion: 3 }, flags: { waterChoice: true } } },
      { text: 'Сосредоточиться на запасах семьи', hint: 'Близкие ↑ · Единство ↓', result: 'Вы создаёте небольшой запас, но вид соседской очереди не оставляет тебя равнодушным.', effects: { stats: { bonds: 4, stress: -1 }, ship: { cohesion: -2 }, flags: { waterChoice: true } } },
      { text: 'Публично критиковать решение', hint: 'Политика · Общество', result: 'Ты задаёшь неудобные вопросы о расходах ведомств. На некоторые из них никто не отвечает.', effects: { stats: { reputation: 2, stress: 4 }, ship: { cohesion: -3 }, flags: { waterChoice: true } } }
    ]
  },
  {
    id: 'festival', category: 'Повседневность', min: 17, max: 70, weight: 1.5,
    title: 'Праздник первой звезды', body: 'Сегодня на корабле отмечают годовщину обнаружения звёздной системы назначения. Дети развешивают бумажные модели планет, музыканты играют в центральном атриуме.', available: g => !g.flags.festivalVisited,
    choices: [
      { text: 'Провести вечер с близкими', hint: 'Связи ↑ · Счастье ↑', result: 'Вы смеётесь над старыми историями. Это один из тех дней, которые не нужно объяснять.', effects: { stats: { bonds: 5, morale: 6 }, bonds: { friend: 3 }, flags: { festivalVisited: true }, memory: 'Праздновал День первой звезды с близкими.' } },
      { text: 'Взяться за общественную работу', hint: 'Репутация ↑', result: 'Ты помогаешь собирать световые гирлянды и оборудование после праздника.', effects: { stats: { reputation: 4, morale: 2 }, flags: { festivalVisited: true } } },
      { text: 'Побыть в одиночестве', hint: 'Стресс ↓', result: 'Музыка едва слышна через перегородку. Ты наконец остаёшься со своими мыслями.', effects: { stats: { stress: -6 }, flags: { festivalVisited: true } } }
    ]
  },
  {
    id: 'strike', category: 'Общество', min: 21, max: 68, weight: 2,
    title: 'Забастовка ремонтных смен', body: 'Рабочие нижних палуб требуют пересмотреть норму труда. Корабль не может надолго остановить обслуживание, но люди устали работать на пределе.', available: g => g.ship.cohesion < 74 && !g.flags.strike,
    choices: [
      { text: 'Поддержать требования рабочих', hint: 'Единство ↕ · Репутация ↕', result: 'Ты подписываешь обращение. Совет обещает переговоры, но часть руководства недовольна.', effects: { ship: { cohesion: 3, hull: -2 }, stats: { reputation: 3, stress: 3 }, flags: { strike: true } } },
      { text: 'Попытаться договориться', hint: 'Коммуникация ↑ · Единство ↑', result: 'Ты помогаешь организовать открытое собрание. Ничего не решено окончательно, но стороны впервые слушают друг друга.', effects: { skills: { social: 5 }, ship: { cohesion: 5 }, stats: { stress: 4 }, flags: { strike: true } } },
      { text: 'Не вмешиваться', hint: 'Личная безопасность', result: 'Споры продолжаются без тебя. Рабочие возвращаются к своим сменам спустя несколько дней.', effects: { stats: { stress: -2 }, ship: { cohesion: -3 }, flags: { strike: true } } }
    ]
  },
  {
    id: 'lost-district', category: 'Тайна', min: 28, max: 65, weight: 1,
    title: 'Закрытый сектор', body: 'В старом плане корабля указан коридор, которого нет в современной системе навигации. Слухи связывают его с давней эпидемией, хотя официальные записи противоречат друг другу.', available: g => g.stats.knowledge >= 50 && !!g.flags.archiveCopy && !g.flags.oldDistrict,
    choices: [
      { text: 'Проверить архивные документы', hint: 'Знания ↑ · Информация', result: 'В документах ты находишь объяснение: сектор законсервировали после аварии с системой охлаждения. Остальные слухи остаются слухами.', effects: { stats: { knowledge: 4 }, flags: { oldDistrict: true }, memory: 'Выяснил происхождение закрытого сектора корабля.' } },
      { text: 'Расспросить старожилов', hint: 'Связи ↑ · Истории', result: 'Люди рассказывают пять разных версий событий. Некоторые несовместимы друг с другом.', effects: { stats: { bonds: 3, knowledge: 2 }, flags: { oldDistrict: true } } },
      { text: 'Оставить тайну в прошлом', hint: 'Спокойствие', result: 'Жизнь полна загадок, которые вовсе не обязаны становиться твоими.', effects: { stats: { stress: -2 }, flags: { oldDistrict: true } } }
    ]
  },
  {
    id: 'midlife', category: 'Личное', min: 38, max: 52, weight: 3,
    title: 'Всё ли это?', body: 'В обычный день ты ловишь себя на мысли, что половина жизни, возможно, уже позади. Корабль движется к цели, а ты всё ещё не уверен, какой была твоя собственная.', available: g => !g.flags.midlife,
    choices: [
      { text: 'Освоить новое направление', hint: 'Знания ↑ · Стресс ↑', result: 'Ты записываешься на занятия и снова чувствуешь себя новичком.', effects: { stats: { knowledge: 6, stress: 3 }, skills: { social: 3 }, flags: { midlife: true }, memory: 'Решил начать учиться чему-то новому в зрелом возрасте.' } },
      { text: 'Проводить больше времени с близкими', hint: 'Отношения ↑', result: 'Ты сокращаешь дополнительные смены. Вечера вдруг становятся длиннее.', effects: { stats: { bonds: 8, morale: 5, reputation: -2 }, flags: { midlife: true } } },
      { text: 'Признать ценность своей обычной жизни', hint: 'Счастье ↑ · Стресс ↓', result: 'Тебе впервые приходит в голову, что не всякую жизнь нужно оправдывать великим достижением.', effects: { stats: { morale: 8, stress: -8 }, flags: { midlife: true }, memory: 'Перестал измерять собственную жизнь только достижениями.' } }
    ]
  },
  {
    id: 'apprentice', category: 'Профессия', min: 40, max: 74, weight: 3,
    title: 'Новый ученик', body: 'Молодой специалист просит тебя стать наставником. Ты видишь в нём себя много лет назад, хотя ваши взгляды на будущее корабля заметно отличаются.', available: g => g.stats.reputation >= 42 && !g.flags.mentored,
    choices: [
      { text: 'Взять ученика под крыло', hint: 'Наследие ↑ · Время', result: 'Ты начинаешь передавать знания. Вопросы ученика заставляют иначе взглянуть на привычные вещи.', effects: { stats: { bonds: 5, morale: 4, stress: 3 }, flags: { mentored: true }, memory: 'Стал наставником молодого специалиста.' } },
      { text: 'Посоветовать другого наставника', hint: 'Без обязательств', result: 'Ты помогаешь найти подходящего человека, но сам не берёшь дополнительных обязанностей.', effects: { stats: { reputation: 2 }, flags: { mentored: false } } },
      { text: 'Отказаться', hint: 'Отдых ↑', result: 'Ты решаешь, что имеешь право не посвящать работе всё оставшееся время.', effects: { stats: { stress: -4, morale: 2 }, flags: { mentored: false } } }
    ]
  },
  {
    id: 'political-crisis', category: 'Общество', min: 26, max: 76, weight: 2,
    title: 'Спор о курсе', body: 'Группа жителей требует провести референдум о замедлении корабля. Их аргумент: новому поколению нужен выбор, а не приказ предков, которых никто не помнит.', available: g => !g.flags.courseVote && g.ship.cohesion < 85,
    choices: [
      { text: 'Поддержать публичное обсуждение', hint: 'Общество ↑ · Неопределённость', result: 'Впервые за много лет вопрос о цели экспедиции обсуждают на открытых собраниях.', effects: { ship: { cohesion: 3 }, stats: { reputation: 3, stress: 3 }, flags: { courseVote: true }, memory: 'Участвовал в обсуждении будущего корабля.' } },
      { text: 'Выступить за сохранение курса', hint: 'Стабильность ↑ · Единство ↕', result: 'Ты напоминаешь о решении основателей. Некоторые благодарят тебя, другие считают это слепой верностью прошлому.', effects: { ship: { hull: 2, cohesion: -2 }, stats: { reputation: 2 }, flags: { courseVote: true } } },
      { text: 'Не участвовать в споре', hint: 'Личные дела', result: 'Референдум проводят без тебя. Мир продолжает меняться, независимо от твоего внимания.', effects: { stats: { stress: -2 }, flags: { courseVote: true } } }
    ]
  },
  {
    id: 'old-friend', category: 'Отношения', min: 48, max: 78, weight: 2,
    title: 'Письмо из другого сектора', body: 'После многих лет молчания {{friend}} присылает сообщение. В нём нет просьбы: только старая фотография вашего класса и короткое «помнишь?».', available: g => !g.flags.oldFriend && g.flags.friendState !== 'estranged' && (g.people.find(p => p.id === 'friend')?.bond ?? 0) >= 45,
    choices: [
      { text: 'Пригласить на встречу', hint: 'Связи ↑', result: 'Вам требуется время, чтобы привыкнуть к изменившимся голосам и лицам. Но отдельные шутки переживают десятилетия.', effects: { stats: { bonds: 7, morale: 6 }, bonds: { friend: 8 }, flags: { oldFriend: true }, memory: 'Воссоединился с другом детства после долгой разлуки.' } },
      { text: 'Отправить длинное письмо', hint: 'Связи ↑', result: 'Ты рассказываешь о прошедших годах честнее, чем собирался.', effects: { stats: { bonds: 3, morale: 2 }, flags: { oldFriend: true } } },
      { text: 'Не отвечать', hint: 'Не возвращаться', result: 'Сообщение остаётся непрочитанным несколько месяцев. В конце концов ты убираешь уведомление.', effects: { stats: { stress: -1 }, flags: { oldFriend: true } } }
    ]
  },
  {
    id: 'retirement', category: 'Личное', min: 60, max: 76, weight: 4,
    title: 'Последний рабочий контракт', body: 'Твой очередной контракт подходит к концу. Молодые сотрудники уже работают по другим инструкциям. Руководство предлагает тебе остаться на облегчённом графике.', available: g => !g.flags.retirement,
    choices: [
      { text: 'Уйти с должности', hint: 'Стресс ↓ · Новая глава', result: 'Ты сдаёшь пропуск. Оказывается, самые непривычные звуки — те, которых вдруг больше нет.', effects: { stats: { stress: -9, morale: 4, reputation: -3 }, flags: { retirement: true }, memory: 'Завершил многолетнюю профессиональную карьеру.' } },
      { text: 'Остаться наставником', hint: 'Репутация ↑ · Стресс ↔', result: 'Ты остаёшься рядом, когда молодые специалисты принимают собственные решения.', effects: { stats: { reputation: 5, bonds: 3 }, flags: { retirement: true, mentored: true }, memory: 'Остался передавать опыт следующему поколению.' } },
      { text: 'Продолжить работать как прежде', hint: 'Карьера ↑ · Здоровье ↓', result: 'Тебе важно быть нужным. Но каждую смену теперь приходится восстанавливать силы дольше.', effects: { stats: { reputation: 5, health: -5, stress: 7 }, flags: { retirement: true } } }
    ]
  },
  {
    id: 'legacy', category: 'Наследие', min: 65, max: 92, weight: 6,
    title: 'Для тех, кто будет после', body: 'Школьный архив собирает личные свидетельства старших жителей. Тебя просят оставить короткую запись о том, что значила для тебя жизнь на «Пилигриме».', available: g => !g.flags.legacyRecorded,
    choices: [
      { text: 'Рассказать о людях', hint: 'Близость ↑ · Память', result: 'Ты вспоминаешь имена и разговоры, которые сделали корабль домом.', effects: { stats: { bonds: 5, morale: 3 }, flags: { legacyRecorded: 'people' }, memory: 'Оставил потомкам запись о людях, которых любил.' } },
      { text: 'Рассказать о работе', hint: 'Дело жизни', result: 'Ты говоришь об ошибках и открытиях, не скрывая неудач.', effects: { stats: { knowledge: 3, morale: 3 }, flags: { legacyRecorded: 'work' }, memory: 'Оставил потомкам честный рассказ о своей работе.' } },
      { text: 'Признаться, что не знаешь ответа', hint: 'Честность', result: 'Получается очень короткая запись. Почему-то именно она нравится архивариусу.', effects: { stats: { morale: 5, stress: -4 }, flags: { legacyRecorded: 'uncertain' }, memory: 'Признал, что не нашёл единственного смысла прожитой жизни.' } }
    ]
  },
  {
    id: 'neighbor-medical', arc: 'neighbor', fork: true, category: 'Отношения', min: 18, max: 55, weight: 2,
    title: 'Просьба соседа', body: '{{neighbor}} просит присмотреть за детьми во время ночной смены. Это неудобно: завтра у тебя тоже ранний подъём. Сосед уверяет, что больше обратиться не к кому.', available: g => !g.flags.neighborFavor,
    choices: [
      { text: 'Остаться и помочь', hint: 'Доверие ↑ · Стресс ↑', result: 'День получается очень длинным, но {{neighbor}} благодарит тебя так, будто ты совершил что-то великое.', effects: { stats: { bonds: 4, stress: 4 }, bonds: { neighbor: 18 }, flags: { neighborFavor: true, neighborHelped: true, neighborPath: 'helped', neighborAge: gYearPlaceholder }, memory: 'Помог соседу в трудный момент, пожертвовав собственным отдыхом.' } },
      { text: 'Предложить другую помощь', hint: 'Коммуникация ↑', result: 'Вы находите дежурного в соседнем блоке. Обошлось без жертв для твоего расписания.', effects: { skills: { social: 2 }, bonds: { neighbor: 5 }, flags: { neighborFavor: true, neighborPath: 'alt', neighborAge: gYearPlaceholder } } },
      { text: 'Вежливо отказаться', hint: 'Отдых ↑ · Доверие ↓', result: 'Сосед находит решение самостоятельно, но некоторое время почти не здоровается.', effects: { stats: { stress: -2 }, bonds: { neighbor: -8 }, flags: { neighborFavor: true, neighborPath: 'refused', neighborAge: gYearPlaceholder } } }
    ]
  },
  {
    id: 'mentor', category: 'Профессия', min: 18, max: 34, weight: 3,
    title: 'Разговор после смены', body: '{{mentor}} замечает, что ты работаешь без прежнего энтузиазма. «Выбирать дело в шестнадцать и всю жизнь держаться за него — странная традиция», — говорит наставник.', available: g => g.flags.trackChosen === true && !g.flags.mentorTalk,
    choices: [
      { text: 'Попросить о смене специальности', hint: 'Новая профессия · Обучение', result: 'Наставник помогает оформить переход на новую специальность. Теперь твоё направление — {{job}}. Начинать снова нелегко.', effects: { job: 'Переобучение', stats: { knowledge: 4, stress: 5 }, bonds: { mentor: 9 }, flags: { mentorTalk: true }, memory: 'Решился изменить профессию после разговора с наставником.' } },
      { text: 'Попросить поддержки в текущей работе', hint: 'Репутация ↑ · Доверие', result: 'Вы составляете план обучения на несколько лет вперёд.', effects: { stats: { reputation: 4, morale: 3 }, bonds: { mentor: 7 }, flags: { mentorTalk: true } } },
      { text: 'Сказать, что всё в порядке', hint: 'Без изменений', result: 'Наставник не настаивает. Иногда самое трудное — признать, что нуждаешься в переменах.', effects: { stats: { stress: 1 }, flags: { mentorTalk: true } } }
    ]
  }
]

/** Сюжеты, написанные в коде (с функциями-условиями). */
export const codeStorylets: Storylet[] = [...baseStorylets, ...extraStorylets, ...arcStorylets, ...lineStorylets, ...mysteryStorylets]

/** Сюжеты из `content/storylets/*.json`, собранные в `src/content/bundle.json` командой `npm run content`. */
export const contentStorylets: Storylet[] = (bundle as ContentBundle).storylets.map(compileStorylet)

export const storylets: Storylet[] = [...codeStorylets, ...contentStorylets]
