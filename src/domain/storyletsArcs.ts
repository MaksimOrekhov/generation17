import type { GameState, Storylet } from './types'

/**
 * Продолжения двух главных линий: «Незарегистрированная трещина» и «Дружба детства».
 * Каждая ветка ведёт в свою сцену со своим набором вариантов, а часть веток не продолжается вовсе:
 * молчание или ссора закрывают целые куски жизни.
 */

const leakFor = (g: GameState, years: number) => typeof g.flags.leakAge === 'number' && g.age >= g.flags.leakAge + years
const stage = (g: GameState, ...names: string[]) => names.includes(String(g.flags.crackStage))
const friendFlag = (g: GameState) => g.flags.friendReturn

export const arcStorylets: Storylet[] = [
  // ───────── Трещина: официальный рапорт ─────────
  {
    id: 'crack-report-hearing', arc: 'crack', category: 'Последствие', min: 26, max: 82, priority: 'followup', weight: 25,
    title: 'Комиссия по безопасности',
    body: 'Спустя годы комиссия пересматривает старые рапорты. Твой, №81-C, значится среди тех, что когда-то «закрыли без последствий». Тебя вызывают дать пояснения. В зале сидит бывший начальник.',
    available: g => g.flags.leakChoice === 'report' && leakFor(g, 4) && !g.flags.crackStage,
    choices: [
      { text: 'Рассказать всё, как было', hint: 'Честность · Конфликт', result: 'Ты излагаешь факты без украшений. Начальнику выносят замечание, тебя благодарят. В курилке ещё долго обсуждают, «кто сдал».', effects: { stats: { reputation: 6, stress: 4 }, ship: { hull: 3 }, flags: { crackStage: 'reported-open' }, memory: 'Выступил{{hero:|а}} на комиссии о давнем рапорте и сказал{{hero:|а}} всё как есть.' } },
      { text: 'Говорить сдержанно и по делу', hint: 'Спокойствие', result: 'Комиссия получает документы, но не получает скандала. Бывший начальник кивает тебе в коридоре почти дружелюбно.', effects: { stats: { reputation: 2, stress: 1 }, flags: { crackStage: 'reported-quiet' } } },
      { text: 'Отказаться давать пояснения', hint: 'Дистанция · Риск', result: 'Ты ссылаешься на давность. Рапорт остаётся в архиве, но вопросов у комиссии меньше не становится.', effects: { stats: { reputation: -3, stress: 2 }, ship: { hull: -2 }, flags: { crackStage: 'reported-silent' }, memory: 'Отказал{{hero:ся|ась}} говорить на комиссии о собственном рапорте.' } }
    ]
  },
  {
    id: 'crack-inspector-offer', arc: 'crack', category: 'Последствие', min: 30, max: 82, priority: 'followup', weight: 22,
    title: 'Группа инспекции',
    body: 'После того разбирательства тебя запомнили. Служба безопасности предлагает место в группе инспекции: ходить по секторам и искать дефекты до того, как они станут авариями. Работа неблагодарная: люди не любят, когда им находят проблемы.',
    available: g => stage(g, 'reported-open') && leakFor(g, 9) && !g.flags.inspector && !!g.people.find(p => p.id === 'mentor')?.alive,
    choices: [
      { text: 'Принять предложение', hint: 'Инженерия ↑ · Репутация ↑', result: 'Первую неделю тебя встречают холодно. Через месяц оказывается, что к тебе приходят сами: «посмотри, а то не по себе».', effects: { skills: { engineering: 8 }, stats: { reputation: 6, stress: 4 }, ship: { hull: 4, air: 2 }, flags: { inspector: 'joined' }, memory: 'Вош{{hero:ёл|ла}} в группу инспекции корабля.' } },
      { text: 'Отказаться, остаться на смене', hint: 'Покой', result: 'Ты объясняешь, что тебе хорошо на своём месте. Предложение достаётся другому, и ты долго не знаешь, жалеть ли.', effects: { stats: { stress: -3, morale: 2 }, flags: { inspector: 'declined' } } },
      { text: 'Порекомендовать вместо себя {{mentor}}', hint: 'Отношения ↑', result: '{{mentor}} теряется, потом вцепляется в предложение. Ты остаёшься в тени, но знаешь, что инспекция в хороших руках.', effects: { stats: { bonds: 3, reputation: 2 }, bonds: { mentor: 6 }, ship: { hull: 2 }, flags: { inspector: 'recommended' } } }
    ]
  },
  {
    id: 'crack-recurrence', arc: 'crack', category: 'Последствие', min: 28, max: 82, priority: 'followup', weight: 22,
    title: 'Тот же контур',
    body: 'Воздушный контур в C-3 снова даёт течь. На этот раз всё серьёзнее. Аварийная бригада перебирает старые записи, а твоего рапорта в архиве нет: кто-то давно «почистил» папку. Ты помнишь схему почти наизусть.',
    available: g => stage(g, 'reported-silent') && leakFor(g, 6),
    choices: [
      { text: 'Предложить аварийной группе всё, что помнишь', hint: 'Ответственность · Репутация ↑', result: 'Ты рисуешь схему по памяти, указываешь слабые точки. Течь удаётся остановить. Начальник группы пожимает руку, не глядя в глаза.', effects: { stats: { reputation: 5, stress: 4 }, ship: { air: 4, hull: 3 }, flags: { crackStage: 'resolved' } } },
      { text: 'Не вмешиваться', hint: 'Дистанция · Корабль ↓', result: 'Бригада справляется, но дольше, чем могла бы. Ты весь день чувствуешь вкус металла во рту.', effects: { stats: { stress: 4, morale: -3 }, ship: { air: -5, hull: -2 }, flags: { crackStage: 'resolved' }, memory: 'Не вмешал{{hero:ся|ась}}, когда авария напомнила о старой трещине.' } }
    ]
  },
  // ───────── Трещина: удачный ремонт ─────────
  {
    id: 'crack-secret-hero', arc: 'crack', category: 'Последствие', min: 28, max: 82, priority: 'followup', weight: 22,
    title: 'Кто здесь работал?',
    body: 'На соседнем участке C-3 случается небольшая авария. Бригада удивляется, что твой старый участок держится идеально. В журнале записей о ремонте нет, и начальник смены спрашивает, чьих это рук дело.',
    available: g => g.flags.leakChoice === 'repair' && g.flags.leakRepaired === true && leakFor(g, 6) && !g.flags.crackStage,
    choices: [
      { text: 'Признаться, что чинил{{hero:|а}} без протокола', hint: 'Честность · Выговор', result: 'Тебя хвалят и тут же отчитывают за нарушение. Но с тех пор зовут, когда надо сделать быстро и хорошо.', effects: { skills: { engineering: 3 }, stats: { reputation: 2, stress: 3 }, flags: { crackStage: 'confessed-repair' } } },
      { text: 'Промолчать: пусть думают, что так и было', hint: 'Тайна', result: 'Бригада списывает всё на удачную сварку. Ты знаешь правду, и она слегка греет.', effects: { stats: { morale: 2, stress: -1 }, flags: { crackStage: 'anonymous-repair' }, memory: 'Никому не сказал{{hero:|а}}, что контур в C-3 починил{{hero:|а}} сам{{hero:|а}}.' } },
      { text: 'Показать молодому технику, как это сделано', hint: 'Наследие ↑', result: 'После смены ты рисуешь схему на обороте накладной. Молодой техник сохраняет её так, будто это реликвия.', effects: { stats: { bonds: 3 }, skills: { engineering: 2 }, flags: { crackStage: 'taught' }, memory: 'Научил{{hero:|а}} молодого техника своему способу ремонта.' } }
    ]
  },
  {
    id: 'crack-student-return', arc: 'crack', category: 'Последствие', min: 34, max: 85, priority: 'followup', weight: 20,
    title: 'Ученик на своём месте',
    body: 'Молодой техник, которому ты когда-то рисовал{{hero:|а}} схему, теперь руководит бригадой. Он приходит с вопросом по сложному ремонту и признаётся, что до сих пор хранит ту накладную.',
    available: g => stage(g, 'taught') && leakFor(g, 12),
    choices: [
      { text: 'Помочь с ремонтом лично', hint: 'Усталость · Радость', result: 'Вы работаете плечом к плечу, как раньше, хотя руки уже не те. Он учится быстрее, чем ты в его годы.', effects: { stats: { morale: 5, stress: 3, bonds: 3 }, skills: { engineering: 2 }, memory: 'Работал{{hero:|а}} бок о бок с бывшим учеником над сложным ремонтом.' } },
      { text: 'Дать совет и отойти', hint: 'Доверие', result: 'Он смотрит с лёгким разочарованием, потом кивает: «Справлюсь». Справляется.', effects: { stats: { reputation: 3, morale: 2 } } },
      { text: 'Попросить записать схему в официальный протокол', hint: 'Наследие', result: 'Через неделю схема появляется в базе под безымянной пометкой «Из практики». Ты спокой{{hero:ен|на}}: теперь она не пропадёт.', effects: { stats: { reputation: 4, knowledge: 2 }, ship: { hull: 2 } } }
    ]
  },
  // ───────── Трещина: неудачный ремонт ─────────
  {
    id: 'crack-failed-leak', arc: 'crack', category: 'Последствие', min: 25, max: 82, priority: 'followup', weight: 24,
    title: 'Сочащиеся крепления',
    body: 'Крепления, которые ты когда-то тронул{{hero:|а}}, начинают сочиться. Утечка пока мелкая, но ты единственный, кто знает, откуда она взялась.',
    available: g => g.flags.leakChoice === 'repair' && g.flags.leakRepaired === false && leakFor(g, 3) && !g.flags.crackStage,
    choices: [
      { text: 'Пойти к начальнику и признаться', hint: 'Честность · Репутация ↓', result: 'Начальник долго молчит, потом подписывает наряд на нормальный ремонт: «Оценю честность». Твоя фамилия попадает в отчёт.', effects: { stats: { reputation: -5, stress: 3 }, ship: { air: 4, hull: 3 }, flags: { crackStage: 'confessed-failure' } } },
      { text: 'Починить втайне ночью', hint: 'Риск · Инженерия', result: 'Ты выходишь после смены с набором инструментов и фонарём.', effects: { stats: { stress: 3 }, flags: { crackStage: 'patched' } }, check: { skill: 'engineering', difficulty: 30, successText: 'На этот раз всё сходится. Давление ровное, утром никто ничего не замечает.', failureText: 'Ты затягиваешь не то. Течь усиливается, и к утру в секторе тревожные огни.', success: { ship: { air: 3 }, stats: { stress: -2, reputation: 1 }, skills: { engineering: 4 } }, failure: { ship: { air: -6 }, stats: { health: -3, stress: 6 }, flags: { crackStage: 'worsened' } } } },
      { text: 'Сообщить анонимно', hint: 'Осторожность', result: 'Запись появляется в журнале без подписи. Дефект устраняют быстро, но ты чувствуешь неловкость: кто-то может догадаться.', effects: { stats: { stress: 3, morale: -1 }, ship: { air: 2, hull: 1 }, flags: { crackStage: 'anon-report' } } }
    ]
  },
  {
    id: 'crack-worsened', arc: 'crack', category: 'Последствие', min: 26, max: 85, priority: 'followup', weight: 26,
    title: 'Эвакуация сектора',
    body: 'Твоя ночная починка не выдерживает. Давление в секторе падает, часть блока эвакуируют, двое пострадавших попадают в клинику. Следователь листает журналы смен и находит записи о том, что ты задерживал{{hero:ся|ась}} на участке.',
    available: g => stage(g, 'worsened'),
    choices: [
      { text: 'Взять ответственность на себя', hint: 'Честность · Тяжело', result: 'Ты говоришь прямо и без оправданий. Тебя отстраняют на год. Пострадавшие спустя время приходят к тебе сами: «Спасибо, что не прятал{{hero:ся|ась}}».', effects: { stats: { reputation: -7, stress: 8, morale: -4 }, ship: { hull: 3 }, flags: { crackStage: 'owned' }, memory: 'Взял{{hero:|а}} на себя ответственность за аварию, которую сам{{hero:|а}} не смог{{hero:|ла}} предотвратить.' } },
      { text: 'Сослаться на дефект материалов', hint: 'Защита · Риск', result: 'Эксперты находят в сплаве скрытую микроструктуру. Это отчасти правда. Дело закрывают, но ты знаешь, чего оно стоило.', effects: { stats: { reputation: -2, stress: 5, morale: -3 }, flags: { crackStage: 'excused' } } },
      { text: 'Уйти с должности', hint: 'Отход', result: 'Ты оформляешь перевод в хозяйственную часть. Без инструментов в руках руки не знают, куда себя деть.', effects: { stats: { stress: -2, morale: -5, reputation: -4 }, skills: { engineering: -4 }, flags: { crackStage: 'resigned' } } }
    ]
  },
  // ───────── Трещина: молчание ─────────
  {
    id: 'crack-silent-accident', arc: 'crack', category: 'Последствие', min: 28, max: 85, priority: 'followup', weight: 26,
    title: 'Падение давления в C-3',
    body: 'Ночью в секторе C-3 падает давление. Два блока эвакуируют, обходится без жертв. В протоколе расследования появляется строка: «Ранее выявленный дефект не был зарегистрирован». Следователь листает журналы смен.',
    available: g => g.flags.leakChoice === 'silent' && leakFor(g, 6) && !g.flags.crackStage,
    choices: [
      { text: 'Прийти к следователю и рассказать', hint: 'Честность · Выговор', result: 'Следователь записывает всё и благодарит сухо. Начальника отстраняют, тебе объявляют выговор. Спишь потом лучше, чем за последние годы.', effects: { stats: { reputation: -6, stress: 3, morale: 3 }, ship: { hull: 2 }, flags: { crackStage: 'silent-confessed' }, memory: 'Признал{{hero:ся|ась}} следователю в давнем молчании о трещине.' } },
      { text: 'Сказать, что ничего не помнишь', hint: 'Молчание', result: 'Следователь смотрит долго и закрывает блокнот. Дело закрывают за недостатком данных. С тех пор ты слышишь вентиляцию иначе.', effects: { stats: { stress: 8, morale: -3 }, flags: { crackStage: 'silent-denied' }, memory: 'Промолчал{{hero:|а}} о давней трещине даже перед следователем и помнит об этом до сих пор.' } },
      { text: 'Указать на начальника', hint: 'Обвинение', result: 'Ты называешь имя. Начальник защищается: именно ты тогда закрыл{{hero:|а}} инспекцию. Расследование разгорается на обоих.', effects: { stats: { reputation: -4, stress: 6, bonds: -3 }, flags: { crackStage: 'silent-blamed' }, memory: 'Назвал{{hero:|а}} имя начальника, когда расследование дошло до молчания о трещине.' } }
    ]
  },
  {
    id: 'crack-confessed-after', arc: 'crack', category: 'Последствие', min: 34, max: 88, priority: 'followup', weight: 20,
    title: 'Разговор с учениками',
    body: 'Молодые техники просят тебя выступить на занятии о культуре безопасности. Они слышали историю про C-3 и хотят услышать её от тебя, а не от учебного протокола.',
    available: g => stage(g, 'silent-confessed') && leakFor(g, 12),
    choices: [
      { text: 'Рассказать всё без прикрас', hint: 'Честность · Наследие', result: 'В аудитории тихо. После занятия двое остаются и спрашивают, как заметить такой дефект самим. Один обещает: «Молчать я не стану».', effects: { stats: { reputation: 4, morale: 5, stress: 2 }, ship: { hull: 3 }, memory: 'Рассказал{{hero:|а}} молодым техникам историю своей ошибки.' } },
      { text: 'Обойтись общими словами', hint: 'Осторожность', result: 'Выступление получается гладким и бесполезным. Ты видишь, как студенты вежливо смотрят на часы.', effects: { stats: { stress: 2, morale: -1 } } }
    ]
  },
  {
    id: 'crack-denied-after', arc: 'crack', category: 'Последствие', min: 34, max: 88, priority: 'followup', weight: 20,
    title: 'Знакомое лицо в очереди',
    body: 'В клинике тебя окликает человек, которого ты узнаёшь с трудом: один из тех, кого эвакуировали в ту ночь. Он улыбается и благодарит: «Хорошо, что вас не было на участке, а то бы и вам досталось».',
    available: g => stage(g, 'silent-denied') && leakFor(g, 12),
    choices: [
      { text: 'Рассказать, что знал{{hero:|а}} о дефекте', hint: 'Признание · Тяжело', result: 'Он молчит, потом говорит, что некоторые вещи лучше знать, чем не знать. Руки у него дрожат, но он не уходит.', effects: { stats: { morale: -2, stress: 5, reputation: 2 }, flags: { crackStage: 'late-confessed' }, memory: 'Спустя годы признал{{hero:ся|ась}} человеку, которого коснулась авария.' } },
      { text: 'Кивнуть и пожелать здоровья', hint: 'Молчание', result: 'Ты желаешь ему всего хорошего и идёшь дальше. Кабинет врача кажется очень далёким.', effects: { stats: { stress: 4, morale: -3 } } },
      { text: 'Тайно оплатить его лечение', hint: 'Искупление', result: 'Ты договариваешься с регистратурой, чтобы счёт закрыли без имён. Легче не становится, но становится чуть яснее.', effects: { stats: { stress: -1, reputation: -1, morale: 1 }, flags: { crackStage: 'atoned' } } }
    ]
  },
  {
    id: 'crack-blamed-after', arc: 'crack', category: 'Последствие', min: 34, max: 88, priority: 'followup', weight: 20,
    title: 'Бывший начальник',
    body: 'Бывший начальник сидит на скамье у обзорной палубы. Бывший начальник сильно постарел. Когда ты проходишь мимо, он поднимает глаза и говорит: «Ты тогда {{hero:был прав|была права}}. Я тоже».',
    available: g => stage(g, 'silent-blamed') && leakFor(g, 12),
    choices: [
      { text: 'Сесть рядом и поговорить', hint: 'Примирение', result: 'Вы сидите молча, пока у обзорного стекла не гаснет свет. Потом он называет имена тех, с кем вместе замял когда-то другие дела.', effects: { stats: { stress: -3, morale: 4, knowledge: 2 }, flags: { crackStage: 'reconciled' } } },
      { text: 'Пройти мимо', hint: 'Дистанция', result: 'Ты идёшь дальше. Через стекло хорошо виден тот же звёздный свет, что и тогда.', effects: { stats: { stress: 1 } } }
    ]
  },
  // ───────── Дружба ─────────
  {
    id: 'friend-return-stood', arc: 'friend', category: 'Последствие', min: 28, max: 65, priority: 'followup', weight: 14,
    title: 'Давняя защита',
    body: 'В коридоре клиники гудит очиститель. {{friend}} на миг прислушивается, потом узнаёт тебя: «Я помню тот неровный гул в школе. И как ты тогда остал{{hero:ся|ась}} рядом, пока остальные отводили глаза».',
    available: g => g.flags.stoodForFriend === true && g.age >= 28 && !friendFlag(g),
    choices: [
      { text: 'Вспомнить тот день вместе', hint: 'Дружба ↑', result: 'Вы вспоминаете, как взрослые спорили о поломке, а {{friend}} тогда перестал{{friend:|а}} оправдываться. «Хорошо, что мы снова можем просто поговорить», — говорит {{friend}}. Ты решаешь, хочется ли тебе этой близости теперь.', effects: { stats: { bonds: 5, morale: 3 }, bonds: { friend: 7 }, flags: { friendReturn: true, friendState: 'close' }, memory: 'Спустя годы встретил{{hero:|а}} друга, которого когда-то защитил{{hero:|а}}.' } },
      { text: 'Отмахнуться: «Это пустяк»', hint: 'Скромность', result: '{{friend}} улыбается: «Для меня тогда было важно, что рядом кто-то остался». Ты можешь оставить благодарность без ответа; вы расходитесь тепло, каждый со своей памятью о том дне.', effects: { stats: { bonds: 2 }, bonds: { friend: 3 }, flags: { friendReturn: true, friendState: 'distant' } } },
      { text: 'Признаться, что тогда было страшно', hint: 'Честность', result: '«Я тоже боял{{hero:ся|ась}} сказать это вслух», — отвечаешь ты. {{friend}} кивает: «Мне было важно не остаться там одному». Сейчас вы оба можете решить, что делать с этой близостью.', effects: { stats: { bonds: 6, stress: -2 }, bonds: { friend: 9 }, flags: { friendReturn: true, friendState: 'close' } } }
    ]
  },
  {
    id: 'friend-return-quiet', arc: 'friend', category: 'Последствие', min: 28, max: 65, priority: 'followup', weight: 14,
    title: 'Чужая благодарность',
    body: 'У входа в клинику {{friend}} благодарит другого человека за то, что тот помог запустить проверку школьного очистителя. На миг перед тобой — та закрытая дверь, за которой ты говорил{{hero:|а}} с учителем. {{friend}} тебя ещё не заметил{{friend:|а}}.',
    available: g => g.flags.quietWitness === true && g.age >= 28 && !friendFlag(g),
    choices: [
      { text: 'Сказать, что это был ты', hint: 'Откровенность', result: '«Я тоже тогда поговорил{{hero:|а}} с учителем», — говоришь ты. {{friend}} замолкает, потом кивает: «Значит, проверка началась не случайно». Ты не просил{{hero:|а}} благодарности, но теперь можешь принять её.', effects: { stats: { bonds: 4, morale: 3 }, bonds: { friend: 7 }, flags: { friendReturn: true, friendState: 'close' } } },
      { text: 'Промолчать', hint: 'Скромность', result: 'Ты оставляешь чужую благодарность тому, кого назвал{{hero:|а}} {{friend}}. Но помнишь и своё: именно твой разговор с учителем помог запустить проверку. Ты уходишь с тихим облегчением и лёгким уколом.', effects: { stats: { stress: -1, morale: 1 }, bonds: { friend: 1 }, flags: { friendReturn: true, friendState: 'distant' } } },
      { text: 'Намекнуть, что знаешь больше', hint: 'Игра', result: 'Ты упоминаешь закрытую дверь и разговор с учителем. {{friend}} смотрит на тебя внимательнее: «Так ты тоже был{{hero:|а}} частью той истории». Благодарность не требует от тебя объяснений.', effects: { stats: { bonds: 3 }, bonds: { friend: 5 }, flags: { friendReturn: true, friendState: 'close' } } }
    ]
  },
  {
    id: 'friend-return-abandoned', arc: 'friend', category: 'Последствие', min: 28, max: 65, priority: 'followup', weight: 14,
    title: 'Взгляд сквозь тебя',
    body: 'В очереди клиники {{friend}} сначала смотрит сквозь тебя, потом всё-таки узнаёт. «После проверки ты так и не сказал{{hero:|а}}, что видел{{hero:|а}}», — произносит {{friend}}. Между вами снова повисает та школьная пауза. Что ты сделаешь с ней теперь?',
    available: g => g.flags.abandonedFriend === true && g.age >= 28 && !friendFlag(g),
    choices: [
      { text: 'Подойти и извиниться', hint: 'Честность · Риск', result: 'Ты подходишь, уже не пряча взгляд. «Я видел{{hero:|а}}, что случилось, и тогда промолчал{{hero:|а}}. Прости».', effects: { stats: { stress: 3 }, flags: { friendReturn: true } }, check: { skill: 'social', difficulty: 10, successText: '{{friend}} долго молчит. «Мне нужно было это услышать», — наконец говорит {{friend}}. Прошлое не меняется, но вы оба остаётесь в разговоре.', failureText: 'Слова выходят неловкими. {{friend}} слушает, затем отвечает: «Я услышал{{friend:|а}} тебя. Но простить сейчас не могу». {{friend}} отворачивается; дальше решать не за тебя.', success: { stats: { bonds: 6, morale: 4 }, bonds: { friend: 12 }, flags: { friendState: 'close' }, memory: 'Наш{{hero:ёл|ла}} слова для извинения перед другом спустя много лет.' }, failure: { stats: { bonds: -1, stress: 3 }, bonds: { friend: 2 }, flags: { friendState: 'distant' } } } },
      { text: 'Оправдаться: «Мы были детьми»', hint: 'Защита', result: '«Мы были детьми», — говоришь ты. {{friend}} отвечает: «Да. Но тогда мне казалось, что ты мог{{hero:|ла}} сказать хоть одно слово». Вы больше не спорите; каждый остаётся при своей версии того дня.', effects: { stats: { stress: 3, morale: -2 }, bonds: { friend: -6 }, flags: { friendReturn: true, friendState: 'estranged' }, memory: 'Так и не помирил{{hero:ся|ась}} со школьным другом: наш{{hero:ёл|ла}} оправдание вместо извинения.' } },
      { text: 'Сделать вид, что не заметил{{hero:|а}}', hint: 'Дистанция', result: 'Ты проходишь мимо. В лифте вспоминаешь не обвинение, а ту секунду, когда мог{{hero:|ла}} поддержать {{friend}} и не решился{{hero:|ась}}. Разговор не состоялся; дальше каждый идёт своей дорогой.', effects: { stats: { stress: -1, morale: -2 }, flags: { friendReturn: true, friendState: 'estranged' }, memory: 'Прош{{hero:ёл|ла}} мимо старого друга и не остановил{{hero:ся|ась}}.' } }
    ]
  },
  {
    id: 'friend-crisis-close', arc: 'friend', category: 'Последствие', min: 35, max: 70, priority: 'followup', weight: 12,
    title: 'Ночной звонок',
    body: '{{friend}} звонит среди ночи. Голос ровный, но слова подбираются плохо: потеря работы в совете, ссора с семьёй. Нужен кто-то, кто просто не будет осуждать.',
    available: g => g.flags.friendState === 'close' && g.age >= 35 && !g.flags.friendCrisis,
    choices: [
      { text: 'Приехать немедленно', hint: 'Дружба ↑ · Стресс ↑', result: 'Ты приходишь в одной куртке. Вы сидите до рассвета, и о главном не говорите почти ничего. Это и есть главное.', effects: { stats: { bonds: 5, stress: 4, morale: 2 }, bonds: { friend: 8 }, flags: { friendCrisis: 'helped' }, memory: 'Приехал{{hero:|а}} к другу среди ночи, когда больше никого не было.' } },
      { text: 'Предложить пожить у себя', hint: 'Отношения ↑↑ · Стресс ↑', result: 'Неделя превращается в три. Каюта становится тесной, но вы никогда не разговаривали так много, как в эти вечера.', effects: { stats: { bonds: 7, stress: 6, reputation: 2 }, bonds: { friend: 10 }, flags: { friendCrisis: 'housed' } } },
      { text: 'Помочь связями, но не лично', hint: 'Осторожность', result: 'Ты звонишь людям, которые могут помочь, и обещаешь заехать. Заезжаешь через неделю. {{friend}} благодарит, но в голосе слышна усталость.', effects: { stats: { reputation: 2 }, bonds: { friend: 2 }, flags: { friendCrisis: 'networked' } } }
    ]
  },
  {
    id: 'friend-crisis-distant', arc: 'friend', category: 'Последствие', min: 35, max: 70, priority: 'followup', weight: 12,
    title: 'Осторожная просьба',
    body: 'От {{friend}} приходит короткое сообщение: нужна небольшая помощь с бумагами. Вы давно не близки, и просьба звучит осторожно, будто писать было непросто.',
    available: g => g.flags.friendState === 'distant' && g.age >= 35 && !g.flags.friendCrisis,
    choices: [
      { text: 'Помочь по-настоящему', hint: 'Дружба ↑', result: 'Ты тратишь на бумаги два вечера и приносишь готовые документы. {{friend}} долго держит их в руках, потом говорит: «Это больше, чем я просил{{friend:|а}}».', effects: { stats: { bonds: 4, stress: 2, morale: 2 }, bonds: { friend: 7 }, flags: { friendCrisis: 'helped', friendState: 'close' } } },
      { text: 'Помочь формально', hint: 'Дистанция', result: 'Ты объясняешь, куда идти и что подписывать. Полезно, но без тепла. Оба знаете, что это почти вежливый отказ.', effects: { bonds: { friend: 2 }, flags: { friendCrisis: 'formal' } } },
      { text: 'Вежливо отказать', hint: 'Дистанция ↑', result: 'Ты ссылаешься на занятость. {{friend}} отвечает коротко: «Понимаю». Больше сообщений не приходит.', effects: { stats: { stress: 1, morale: -2 }, bonds: { friend: -4 }, flags: { friendCrisis: 'refused', friendState: 'estranged' }, memory: 'Отказал{{hero:|а}} давнему другу, когда тот впервые за много лет попросил о помощи.' } }
    ]
  }
]
