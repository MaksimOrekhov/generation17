import type { Storylet } from './types'

/** Сюжетные решения по возрастам: раннее детство, юность, зрелость и поздние годы. */
export const extraStorylets: Storylet[] = [
  {
    id: 'nursery-day', category: 'Детство', min: 3, max: 5, weight: 4,
    title: 'Первый день среди детей',
    body: 'Сегодня тебя ведут в общую игровую комнату сектора. Там шумно, много незнакомых лиц и корзина с деревянными зверями. {{parent}} задерживается у входа и ждёт, что ты решишь.',
    available: g => !g.flags.nursery,
    choices: [
      { text: 'Держаться за {{parent}}', hint: 'Спокойствие ↑ · Близость', result: 'Ты не отпускаешь руку, пока не привыкаешь к шуму. Игра начинается позже, зато тебя никто не торопит.', effects: { stats: { stress: -2, bonds: 1 }, bonds: { parent: 5 }, flags: { nursery: 'cling' } } },
      { text: 'Сразу пойти к корзине со зверями', hint: 'Смелость · Новые знакомые', result: 'Ты берёшь деревянного кота и показываешь его первому, кого встретил{{hero:|а}}. Через час вы строите вместе загон.', effects: { stats: { morale: 3, bonds: 2 }, skills: { social: 1 }, flags: { nursery: 'brave' } } },
      { text: 'Смотреть со стороны', hint: 'Наблюдательность ↑', result: 'Ты долго следишь за тем, как играют другие. К вечеру ты знаешь, кто кого любит, а кто боится.', effects: { stats: { knowledge: 3 }, flags: { nursery: 'watcher' } } }
    ]
  },
  {
    id: 'night-fear', category: 'Детство', min: 3, max: 7, weight: 3,
    title: 'Ночной коридор',
    body: 'Среди ночи ты просыпаешься от глухого стука в стене. В коридоре за дверью мигает дежурный свет, и тень от трубы похожа на что-то живое. {{parent}} спит в соседней комнате.',
    available: g => !g.flags.nightFear,
    choices: [
      { text: 'Разбудить {{parent}}', hint: 'Близость ↑', result: '{{parent}} без лишних слов объясняет, что корабль иногда переговаривается сам с собой. Засыпаете вместе.', effects: { stats: { stress: -3, morale: 1 }, bonds: { parent: 6 }, flags: { nightFear: true } } },
      { text: 'Подойти к двери и посмотреть', hint: 'Смелость · Стресс ↑', result: 'Тень оказывается просто трубой с лампой. Ты возвращаешься в постель с гордостью и лёгкой дрожью.', effects: { stats: { stress: 3, knowledge: 2, morale: 2 }, flags: { nightFear: true } } },
      { text: 'Накрыться одеялом и ждать утра', hint: 'Терпение', result: 'Время тянется долго. Утром ты почти не помнишь ночи, но с тех пор плотнее закрываешь дверь.', effects: { stats: { stress: 2 }, flags: { nightFear: true } } }
    ]
  },
  {
    id: 'lost-corridor', category: 'Детство', min: 5, max: 9, weight: 3,
    title: 'Не тот поворот',
    body: 'Возвращаясь из школьной комнаты, ты сворачиваешь не туда и оказываешься в коридоре с одинаковыми дверями. Номеров на них нет, а в одном конце слышно знакомое радио.',
    available: g => !g.flags.lostCorridor,
    choices: [
      { text: 'Идти на звук радио', hint: 'Находчивость', result: 'Радио приводит к двери, за которой {{neighbor}} чинит очередную деталь. {{neighbor:Он|Она}} молча провожает тебя до дома.', effects: { stats: { morale: 2, knowledge: 2 }, bonds: { neighbor: 6 }, flags: { lostCorridor: true } } },
      { text: 'Сесть и ждать взрослых', hint: 'Осторожность', result: 'Тебя находят быстро, но ты успеваешь надумать столько, что запоминаешь это на всю жизнь.', effects: { stats: { stress: 3 }, flags: { lostCorridor: true } } },
      { text: 'Исследовать коридор', hint: 'Любопытство · Риск', result: 'За третьей дверью оказывается пустая каюта с окном. Ты возвращаешься поздно, но знаешь теперь о корабле чуть больше.', effects: { stats: { knowledge: 4, stress: 2 }, flags: { lostCorridor: true, destinationCurious: true } } }
    ]
  },
  {
    id: 'school-play', category: 'Детство', min: 8, max: 12, weight: 3,
    title: 'Школьное представление',
    body: 'К Дню первой звезды класс готовит представление о начале полёта. Учитель предлагает тебе одну из ролей: главную, на сцене, или помощь за кулисами.',
    available: g => !g.flags.schoolPlay,
    choices: [
      { text: 'Взять главную роль', hint: 'Репутация ↑ · Стресс ↑', result: 'Ты путаешь половину слов, но зал аплодирует так, что слышно в соседнем секторе.', effects: { stats: { reputation: 4, stress: 4, morale: 3 }, skills: { social: 2 }, flags: { schoolPlay: 'lead' }, memory: 'Сыграл{{hero:|а}} главную роль в школьном представлении о начале полёта.' } },
      { text: 'Работать за кулисами', hint: 'Инженерия ↑', result: 'Ты придумываешь, как заставить бумажные звёзды «мерцать». Зрители ахают, не зная, чья это заслуга.', effects: { skills: { engineering: 2 }, stats: { knowledge: 2, morale: 2 }, flags: { schoolPlay: 'backstage' } } },
      { text: 'Отказаться', hint: 'Покой', result: 'Ты смотришь представление из зала. Оно получается неплохим, но ты ловишь себя на мысли, что смог бы лучше.', effects: { stats: { stress: -2, morale: -1 }, flags: { schoolPlay: 'refused' } } }
    ]
  },
  {
    id: 'curfew-night', category: 'Юность', min: 14, max: 17, weight: 3,
    title: 'Ночь без отбоя',
    body: 'Вечером {{friend}} шепчет, что на верхнем ярусе сегодня ночью можно будет увидеть, как корабль переключает режим освещения. Нужно уйти из дома и вернуться до утренней проверки.',
    available: g => !g.flags.curfewNight,
    choices: [
      { text: 'Пойти вместе', hint: 'Дружба ↑ · Риск', result: 'Вы стоите на узкой площадке и видите, как свет в куполах гаснет целым этажом и загорается снова. Домой возвращаетесь на рассвете.', effects: { stats: { morale: 5, stress: 2 }, bonds: { friend: 9 }, flags: { curfewNight: 'went' }, memory: 'Ночью с другом смотрел{{hero:|а}}, как корабль переключает освещение.' } },
      { text: 'Остаться и прикрыть друга', hint: 'Доверие ↑', result: 'Ты изображаешь крепкий сон за двоих. Утром {{friend}} благодарит, а родителям ничего не говорит.', effects: { stats: { bonds: 2 }, bonds: { friend: 6 }, flags: { curfewNight: 'covered' } } },
      { text: 'Отказаться и отговорить друга', hint: 'Осторожность', result: '{{friend}} дуется, но остаётся. Рассвет вы встречаете дома — как обычно.', effects: { stats: { reputation: 2, stress: -1 }, bonds: { friend: -4 }, flags: { curfewNight: 'refused' } } }
    ]
  },
  {
    id: 'annual-exam', category: 'Юность', min: 14, max: 15, weight: 3,
    title: 'Годовой экзамен',
    body: 'Результаты годового экзамена определят, какие специальности будут открыты на следующем распределении. Времени остаётся немного, а тема обширная.',
    available: g => !g.flags.annualExam,
    choices: [
      { text: 'Зубрить всю ночь', hint: 'Знания ↑ · Стресс ↑', result: 'Утром голова гудит, но на экзамене ты помнишь почти всё.', effects: { stats: { knowledge: 6, stress: 6, health: -1 }, flags: { annualExam: true } } },
      { text: 'Повторять вместе с {{friend}}', hint: 'Дружба ↑ · Знания ↑', result: 'Вы спорите, проверяете друг друга и смеётесь над собственными ошибками. Знаний прибавляется меньше, чем могло бы, но экзамен проходит спокойнее.', effects: { stats: { knowledge: 3, morale: 3, bonds: 2 }, bonds: { friend: 6 }, flags: { annualExam: true } } },
      { text: 'Положиться на удачу', hint: 'Риск', result: 'Экзамен идёт как попало. Кое-что ты помнишь удивительно хорошо, кое-что не помнишь совсем.', effects: { stats: { stress: -2, knowledge: 1 }, flags: { annualExam: true } }, check: { skill: 'social', difficulty: 6, successText: 'Темы совпали с теми, что ты знал{{hero:|а}}. Результат лучше ожиданий.', failureText: 'Несколько вопросов оказались совсем незнакомыми. Результат ниже ожиданий.', success: { stats: { reputation: 3, morale: 3 } }, failure: { stats: { reputation: -2, stress: 3 } } } }
    ]
  },
  {
    id: 'promotion', category: 'Профессия', min: 28, max: 52, weight: 3,
    title: 'Предложение руководить сменой',
    body: 'Старший по смене уходит на покой. Руководство предлагает его место тебе: больше ответственности, больше людей в подчинении и совсем другой график.',
    available: g => g.flags.trackChosen === true && !g.flags.promotion,
    choices: [
      { text: 'Принять должность', hint: 'Репутация ↑ · Стресс ↑', result: 'Первые недели тяжёлые: люди, которые раньше были коллегами, теперь смотрят иначе. Но постепенно ты привыкаешь.', effects: { stats: { reputation: 8, stress: 6, morale: -1 }, skills: { social: 3 }, flags: { promotion: 'accepted' }, memory: 'Принял{{hero:|а}} должность старшего смены.' } },
      { text: 'Предложить вместо себя коллегу', hint: 'Отношения ↑', result: 'Коллега сначала не верит, потом благодарит. Руководство слегка удивлено, но не возражает.', effects: { stats: { bonds: 4, reputation: 3 }, flags: { promotion: 'recommended' } } },
      { text: 'Отказаться', hint: 'Покой · Карьера ↓', result: 'Ты остаёшься на прежнем месте. Иногда жалеешь, но чаще радуешься вечерам, свободным от чужих проблем.', effects: { stats: { stress: -4, morale: 3, reputation: -2 }, flags: { promotion: 'declined' } } }
    ]
  },
  {
    id: 'deck-lottery', category: 'Общество', min: 24, max: 46, weight: 3,
    title: 'Жеребьёвка на верхние палубы',
    body: 'Совет раз в несколько лет проводит жеребьёвку: небольшое число семей получает каюты на верхних палубах. Твой номер в списке, а условия подачи просты, но обязывающие.',
    available: g => g.birth.wealth <= 2 && !g.flags.deckLottery,
    choices: [
      { text: 'Подать заявку', hint: 'Шанс · Придётся рискнуть', result: 'Ты заполняешь бумаги, собираешь подписи и ждёшь. Решение приходит через месяц.', effects: { stats: { stress: 3 }, flags: { deckLottery: 'applied' } }, check: { skill: 'social', difficulty: 12, successText: 'Тебя вносят в список. Новые стены и новый вид из окна — а вот старые соседи скучают.', failureText: 'Номер не выпал. Но ты познакомил{{hero:ся|ась}} с людьми, которые тоже ждут.', success: { stats: { morale: 8, reputation: 3, bonds: -3 }, flags: { movedUp: true }, memory: 'Выиграл{{hero:|а}} место на верхних палубах.' }, failure: { stats: { morale: -2, bonds: 2 } } } },
      { text: 'Отдать место семье соседей', hint: 'Репутация ↑ · Отношения ↑', result: 'Ты тихо передаёшь номер семье с маленькими детьми. Они плачут от радости, а ты неожиданно чувствуешь облегчение.', effects: { stats: { reputation: 6, morale: 3 }, bonds: { neighbor: 8 }, flags: { deckLottery: 'gave' } } },
      { text: 'Не участвовать', hint: 'Привычное место', result: 'Тебе хорошо там, где всё знакомо. Жребий достаётся другим.', effects: { stats: { stress: -2 }, flags: { deckLottery: 'skipped' } } }
    ]
  },
  {
    id: 'health-scare', category: 'Здоровье', min: 30, max: 62, weight: 3,
    title: 'Давящая боль',
    body: 'После смены в груди появляется давящая боль. Она проходит через полчаса, но возвращается на следующей неделе. В клинике очередь, а у тебя график без окон.',
    available: g => !g.flags.healthScare,
    choices: [
      { text: 'Идти в клинику', hint: 'Здоровье ↑ · Время ↓', result: 'Врач находит начало проблемы и выписывает режим. Ты отнимаешь несколько вечеров у других дел, но всё остаётся под контролем.', effects: { stats: { health: 5, stress: 2 }, flags: { healthScare: 'treated' } } },
      { text: 'Сменить режим самому', hint: 'Осторожность', result: 'Ты сокращаешь смены, больше гуляешь и отказываешься от второй чашки чая. Боль возвращается, но реже.', effects: { stats: { health: 2, stress: -2, reputation: -1 }, flags: { healthScare: 'self' } } },
      { text: 'Не обращать внимания', hint: 'Риск', result: 'Боль скоро проходит, и ты перестаёшь о ней думать. Пока.', effects: { stats: { health: -4 }, flags: { healthScare: 'ignored' } } }
    ]
  },
  {
    id: 'garden-plot', category: 'Поздняя жизнь', min: 55, max: 80, weight: 3,
    title: 'Участок в биокуполе',
    body: 'Садовая комиссия предлагает пожилым жителям небольшие участки в общественном биокуполе. Работа лёгкая, а вот ответственность — настоящая: растения не прощают забывчивости.',
    available: g => !g.flags.gardenPlot,
    choices: [
      { text: 'Взять участок', hint: 'Покой ↑ · Здоровье ↑', result: 'Первый месяц земля не слушается, потом начинает давать всходы. По вечерам ты приходишь просто посидеть среди зелени.', effects: { stats: { morale: 6, stress: -6, health: 2 }, skills: { ecology: 3 }, flags: { gardenPlot: 'own' }, memory: 'Зав{{hero:ёл|ела}} маленький огород в общественном биокуполе.' } },
      { text: 'Взять вместе с соседом', hint: 'Дружба ↑', result: 'Вдвоём вы спорите об удобрениях и сортах, но участок получается лучше, чем у многих.', effects: { stats: { bonds: 5, morale: 4 }, bonds: { neighbor: 6 }, flags: { gardenPlot: 'shared' } } },
      { text: 'Отказаться', hint: 'Без обязательств', result: 'Ты любишь зелень, но не хочешь привязываться к грядкам. Участок достаётся другому.', effects: { stats: { stress: -1 }, flags: { gardenPlot: 'refused' } } }
    ]
  },
  {
    id: 'last-window', category: 'Поздняя жизнь', min: 70, max: 95, weight: 3,
    title: 'Вечер на обзорной палубе',
    body: 'Ты давно не выходил{{hero:|а}} к обзорному стеклу. Сегодня решаешь дойти туда. Ноги не слушаются так, как раньше, но дорога знакомая, а вдали светится та же точка, что и в детстве.',
    available: g => !g.flags.lastWindow,
    choices: [
      { text: 'Взять с собой близкого человека', hint: 'Отношения ↑', result: 'Вы идёте медленно, и по дороге ты рассказываешь то, о чём раньше не решал{{hero:ся|ась}}. У стекла вы стоите молча.', effects: { stats: { bonds: 5, morale: 6 }, flags: { lastWindow: 'together' }, memory: 'Под конец жизни снова выш{{hero:ел|ла}} к обзорному стеклу вместе с близким человеком.' } },
      { text: 'Пойти одному', hint: 'Тишина', result: 'Ты стоишь до тех пор, пока ноги не затекают. Звезда та же. Теперь ты знаешь, что она никогда не станет ближе — и принимаешь это.', effects: { stats: { morale: 4, stress: -6 }, flags: { lastWindow: 'alone' }, memory: 'Простоял вечер у окна одн{{hero:ин|а}} и примирил{{hero:ся|ась}} с тем, что цель останется далёкой.' } },
      { text: 'Остаться дома', hint: 'Покой', result: 'Ты смотришь на ту же звезду через маленькое окно каюты. Выходит не хуже.', effects: { stats: { stress: -2 }, flags: { lastWindow: 'home' } } }
    ]
  }
]
