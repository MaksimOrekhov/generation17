import { gYearPlaceholder as NOW } from './constants'
import type { GameState, Storylet } from './types'

/**
 * Ветвящиеся линии: «Сигнал», «Родитель», «Сосед», «Любовь».
 * Выбор в начале линии определяет, какое продолжение наступит и наступит ли вообще.
 * Возраст начала хранится во флагах (`signalAge`, `parentAge`, …), стадия — в `…Stage`.
 */

const since = (g: GameState, key: string, years: number) => typeof g.flags[key] === 'number' && g.age >= (g.flags[key] as number) + years
const is = (g: GameState, key: string, ...values: string[]) => values.includes(String(g.flags[key]))
const alive = (g: GameState, id: string) => !!g.people.find(p => p.id === id)?.alive

export const lineStorylets: Storylet[] = [
  // ═════════ СИГНАЛ ═════════
  {
    id: 'signal-result', arc: 'signal', category: 'Тайна', min: 24, max: 80, weight: 20,
    title: 'Происхождение сигнала',
    body: 'Спустя годы тебе удаётся сопоставить сигнал с архивом навигации: это автоматический маяк, отправленный ещё до рождения твоих родителей. Но зачем его скрыли от гражданского реестра?',
    available: g => typeof g.flags.signalInvestigated === 'number' && since(g, 'signalInvestigated', 4) && !g.flags.signalClosed,
    choices: [
      { text: 'Опубликовать исследование', hint: 'Репутация ↕ · Общество', result: 'Публикация вызывает оживлённые споры. Администрация обещает провести проверку.', effects: { stats: { knowledge: 4, reputation: 8, stress: 5 }, ship: { cohesion: -4 }, flags: { signalClosed: true, publishedSignal: true, signalStage: 'published', signalStageAge: NOW }, memory: 'Публикация сведений о старом навигационном маяке.' } },
      { text: 'Передать информацию архивариусу', hint: 'Без публичного конфликта', result: 'Архивариус благодарит и запечатывает материалы до следующего пересмотра реестра.', effects: { stats: { reputation: 3, stress: -2 }, flags: { signalClosed: true, signalStage: 'archived', signalStageAge: NOW } } },
      { text: 'Сохранить тайну', hint: 'Тихое решение', result: 'Ты оставляешь запись себе. Иногда страшно знать то, чего никто больше не хочет знать.', effects: { stats: { stress: 3 }, flags: { signalClosed: true, signalStage: 'secret', signalStageAge: NOW }, memory: 'Тайна старого маяка, которую удалось сохранить.' } }
    ]
  },
  {
    id: 'signal-public-debate', arc: 'signal', category: 'Последствие', min: 28, max: 85, weight: 22,
    title: 'Комиссия по маяку',
    body: 'Администрация создала комиссию по твоей публикации. Жители спорят: одни называют тебя разрушителем спокойствия, другие требуют открыть остальные закрытые архивы.',
    available: g => is(g, 'signalStage', 'published') && since(g, 'signalStageAge', 5),
    choices: [
      { text: 'Выступить на открытом собрании', hint: 'Репутация ↑ · Единство ↕', result: 'Зал полон. Ты говоришь о праве знать то, что принадлежит всем. Одни аплодируют, другие уходят хлопнув дверью.', effects: { stats: { reputation: 5, stress: 5 }, ship: { cohesion: -3 }, flags: { signalStage: 'debated-open', signalStageAge: NOW } } },
      { text: 'Работать с комиссией без шума', hint: 'Знания ↑ · Тихо', result: 'Тебя допускают к закрытым материалам. Работы много, а громких слов нет, и это тебя вполне устраивает.', effects: { stats: { knowledge: 4, stress: 2 }, flags: { signalStage: 'debated-quiet', signalStageAge: NOW } } },
      { text: 'Отказаться от дальнейшего участия', hint: 'Покой · Репутация ↓', result: 'Ты объясняешь, что сказал всё, что хотел. Комиссия без тебя работает медленнее, и это замечают.', effects: { stats: { stress: -3, reputation: -2 }, flags: { signalStage: 'withdrew', signalStageAge: NOW } } }
    ]
  },
  {
    id: 'signal-report', arc: 'signal', category: 'Последствие', min: 32, max: 88, weight: 20,
    title: 'Отчёт комиссии',
    body: 'Комиссия публикует итог: маяк оказывается автоматической системой наведения, которую никто не собирался скрывать. Просто со временем о ней забыли. Часть жителей разочарована, часть счастлива, что тайна оказалась безобидной.',
    available: g => is(g, 'signalStage', 'debated-open') && since(g, 'signalStageAge', 6),
    choices: [
      { text: 'Предложить построить приёмник и слушать маяк', hint: 'Наследие', result: 'Идея сначала кажется чудачеством. Через год у обзорной палубы появляется скромная антенна, а у неё дежурит группа энтузиастов.', effects: { stats: { reputation: 4, knowledge: 3, morale: 4 }, ship: { cohesion: 3 }, memory: 'Приёмник для старого навигационного маяка по твоей идее.' } },
      { text: 'Согласиться с отчётом и вернуться к делам', hint: 'Спокойствие', result: 'Ты читаешь отчёт дважды и кладёшь в архив. Тайна исчезла, но и вины никто не искал.', effects: { stats: { stress: -3, morale: 1 } } },
      { text: 'Требовать публикации всех материалов', hint: 'Принципиальность · Конфликт', result: 'Ты добиваешься открытия двух старых папок. В них нет ничего зловещего, но споров о том, почему их закрыли, хватает ещё на год.', effects: { stats: { reputation: 2, stress: 4, knowledge: 3 }, ship: { cohesion: -2 } } }
    ]
  },
  {
    id: 'signal-archive-opened', arc: 'signal', category: 'Последствие', min: 32, max: 88, weight: 18,
    title: 'Пересмотр реестра',
    body: 'Архив пересматривает запечатанные материалы. Новый архивариус находит среди них твой отчёт о маяке и приглашает поговорить: обычно такие папки открывают лишь по просьбе авторов.',
    available: g => is(g, 'signalStage', 'archived') && since(g, 'signalStageAge', 8),
    choices: [
      { text: 'Разрешить опубликовать материалы', hint: 'Открытость', result: 'Через месяц отчёт появляется в открытом доступе под твоей фамилией. Реакция тихая: интерес вялый, но несколько людей пишут по делу.', effects: { stats: { reputation: 3, knowledge: 2 }, flags: { signalLate: true } } },
      { text: 'Оставить запечатанным', hint: 'Осторожность', result: 'Архивариус записывает отказ без комментариев. Годы идут, а папка остаётся лежать там, где лежала.', effects: { stats: { stress: -1 } } },
      { text: 'Попросить упомянуть тебя как автора', hint: 'Признание', result: 'Архивариус слегка растерян, но вносит строчку в реестр. Приятно видеть своё имя в графе, где ты его не ждал.', effects: { stats: { reputation: 2, morale: 2 } } }
    ]
  },
  {
    id: 'signal-secret-visitor', arc: 'signal', category: 'Последствие', min: 34, max: 88, weight: 20,
    title: 'Гость из архива',
    body: 'К тебе приходит молодая сотрудница архива. Она нашла упоминание о старой записи сигнала и догадалась, что копия может быть у тебя. «Я никому не скажу, — говорит она. — Просто хочу знать, что там».',
    available: g => is(g, 'signalStage', 'secret') && since(g, 'signalStageAge', 10),
    choices: [
      { text: 'Рассказать всё и показать запись', hint: 'Доверие · Знания ↑', result: 'Вы допоздна сидите над схемами. Она задаёт вопросы, о которых ты сам давно не думал. К утру вы оба понимаете: тайна уже не тайна, а просто неоконченная работа.', effects: { stats: { knowledge: 4, bonds: 3, stress: -3 }, flags: { signalStage: 'shared' }, memory: 'Откровенный разговор с молодым архивистом о старом маяке.' } },
      { text: 'Сказать, что ничего не знаешь', hint: 'Молчание', result: 'Она кивает и уходит. На пороге оборачивается: «Если передумаете…». Ты весь вечер слышишь эти слова.', effects: { stats: { stress: 3 }, flags: { signalStage: 'kept' } } },
      { text: 'Уничтожить копию записи', hint: 'Радикально', result: 'Ты стираешь файл и сжигаешь бумажные заметки. Никто не узнает. Слишком тихо в каюте.', effects: { stats: { stress: 4, knowledge: -2, morale: -2 }, flags: { signalStage: 'destroyed' }, memory: 'Уничтоженная копия записи старого маяка.' } }
    ]
  },
  {
    id: 'signal-rumor-circle', arc: 'signal', category: 'Тайна', min: 24, max: 80, weight: 18,
    title: 'Кружок любителей сигнала',
    body: 'Друзья, с которыми ты когда-то обсуждал странный сигнал, собрались кружком. Они научились принимать его через самодельную антенну и теперь предлагают отправить в ответ короткое сообщение.',
    available: g => g.flags.heardSignal === true && !g.flags.signalInvestigated && since(g, 'signalAge', 4) && !g.flags.signalCircle,
    choices: [
      { text: 'Присоединиться к кружку', hint: 'Дружба ↑ · Риск', result: 'Вы собираетесь по вечерам в тесной комнате и шёпотом спорите, что именно написать. Это лучшее время месяца.', effects: { stats: { knowledge: 3, bonds: 4, stress: 3 }, flags: { signalCircle: 'joined', signalStageAge: NOW } } },
      { text: 'Предупредить администрацию', hint: 'Осторожность · Отношения ↓', result: 'Ты передаёшь сведения дежурному. Эксперимент закрывают, антенну разбирают. Бывшие друзья перестают здороваться.', effects: { stats: { reputation: 3, bonds: -5, stress: 2 }, flags: { signalCircle: 'warned', signalStageAge: NOW } } },
      { text: 'Остаться в стороне', hint: 'Покой', result: 'Ты желаешь друзьям удачи и возвращаешься к своим делам. О кружке потом слышишь только стороной.', effects: { stats: { stress: -2 }, flags: { signalCircle: 'out' } } }
    ]
  },
  {
    id: 'signal-circle-joined', arc: 'signal', category: 'Последствие', min: 28, max: 85, weight: 18,
    title: 'Ответ отправлен',
    body: 'Сообщение ушло. Ответа не было, но кружок не распался: теперь он собирается раз в месяц, и среди участников появляются те, кто пришёл уже не за тайной, а за компанией.',
    available: g => is(g, 'signalCircle', 'joined') && since(g, 'signalStageAge', 5),
    choices: [
      { text: 'Остаться и стать душой кружка', hint: 'Общество ↑', result: 'Ты ведёшь протоколы, встречаешь новичков и учишься варить чай в тесной комнате. Люди приходят к тебе за советом, хотя ты не помнишь, когда это началось.', effects: { stats: { bonds: 5, morale: 4, reputation: 2 }, memory: 'Много лет у руля кружка любителей старого сигнала.' } },
      { text: 'Передать дела молодым и уйти', hint: 'Передача', result: 'Ты оставляешь им ключи от комнаты и антенны. Прощание получается тёплым, а ты вдруг понимаешь, как мало времени у тебя было для себя.', effects: { stats: { stress: -3, bonds: 2, morale: 2 } } },
      { text: 'Предложить показать отчёт администрации', hint: 'Открытость · Риск', result: 'Ты приносишь материалы кружка в совет. Администрация слушает и неожиданно выделяет скромный грант на оборудование.', effects: { stats: { reputation: 4, knowledge: 3 }, ship: { cohesion: 2 } } }
    ]
  },
  {
    id: 'signal-circle-warned', arc: 'signal', category: 'Последствие', min: 28, max: 85, weight: 18,
    title: 'Прежние знакомые',
    body: 'В очереди в столовую тебя окликает человек из того самого кружка. Человек давно не здоровался, но сейчас подходит сам: «Нам нужно поговорить. Не о сигнале, а о том, что случилось потом».',
    available: g => is(g, 'signalCircle', 'warned') && since(g, 'signalStageAge', 6),
    choices: [
      { text: 'Выслушать', hint: 'Примирение', result: 'Выясняется, что кружок распался не из-за твоего доноса, а из-за ссор, которые начались раньше. Но обида осталась, и вы оба решаете наконец её проговорить.', effects: { stats: { stress: -2, bonds: 3, morale: 2 } } },
      { text: 'Объяснить, что хотел защитить всех', hint: 'Оправдание', result: 'Звучит убедительно, но собеседник качает головой: «Мы бы справились сами». Разговор заканчивается вежливо, но без тепла.', effects: { stats: { stress: 2, reputation: 1 } } },
      { text: 'Не останавливаться', hint: 'Дистанция', result: 'Ты киваешь и проходишь мимо. Слышишь за спиной: «Ну и ладно». Эти слова застревают надолго.', effects: { stats: { stress: 3, morale: -2 }, memory: 'Встреча с бывшими знакомыми из кружка, к которым не подошли.' } }
    ]
  },
  {
    id: 'signal-ignored-echo', arc: 'signal', category: 'Последствие', min: 28, max: 88, weight: 16,
    title: 'Старый сигнал',
    body: 'Молодой человек из соседнего сектора случайно нашёл в сети ту самую запись сигнала и теперь расспрашивает всех, кто помнит те времена. Тебе говорят: «Ты же тогда слышал его. Что думаешь?»',
    available: g => g.flags.ignoredSignal === true && !g.flags.signalInvestigated && since(g, 'signalAge', 8) && !g.flags.signalLate,
    choices: [
      { text: 'Признаться, что слышал и отмахнулся', hint: 'Честность', result: 'Молодой человек хмыкает: «Похоже, отмахивались все». Но слушает дальше и благодарит за честность.', effects: { stats: { bonds: 2, morale: -1, knowledge: 2 }, flags: { signalLate: true } } },
      { text: 'Помочь разобраться с архивом', hint: 'Знания ↑ · Время', result: 'Вы вместе роетесь в старых каталогах три вечера подряд. Находка небольшая, но вы оба довольны.', effects: { stats: { knowledge: 4, bonds: 3 }, flags: { signalLate: true }, memory: 'Разбор старого сигнала много лет спустя вместе с молодым человеком.' } },
      { text: 'Отмахнуться снова', hint: 'Покой', result: 'Ты пожимаешь плечами и возвращаешься к делам. Вечером вдруг замечаешь, что прислушиваешься к тишине.', effects: { stats: { stress: -1 }, flags: { signalLate: true } } }
    ]
  },

  // ═════════ РОДИТЕЛЬ ═════════
  {
    id: 'parent-illness-followup', arc: 'parent', category: 'Последствие', min: 28, max: 75, weight: 13,
    title: 'Старые фотографии',
    body: '{{parent}} приглашает тебя разобрать семейный архив. Среди снимков — первый жилой блок, ещё до последней реконструкции, и десятки незнакомых лиц.',
    available: g => is(g, 'parentCare', 'close') && since(g, 'parentAge', 4) && !g.flags.parentArchive,
    choices: [
      { text: 'Записать семейную историю', hint: 'Память ↑ · Близость ↑', result: 'Вы несколько вечеров говорите о прошлом. Некоторые имена впервые получают истории.', effects: { stats: { bonds: 5, knowledge: 4 }, bonds: { parent: 7 }, flags: { parentArchive: true, parentStage: 'recorded', parentStageAge: NOW }, memory: 'Записанная семейная история для следующего поколения.' } },
      { text: 'Помочь разобрать вещи', hint: 'Близость ↑', result: 'Вы почти не говорите, но иногда поддержка не нуждается в словах.', effects: { stats: { bonds: 4 }, flags: { parentArchive: true, parentStage: 'helped', parentStageAge: NOW } } },
      { text: 'Отложить встречу', hint: 'Работа', result: 'Ты обещаешь заглянуть позже. Ещё один день проходит слишком быстро.', effects: { stats: { stress: 2 }, flags: { parentArchive: true, parentStage: 'postponed', parentStageAge: NOW } } }
    ]
  },
  {
    id: 'parent-keepsake', arc: 'parent', category: 'Последствие', min: 34, max: 85, weight: 16,
    title: 'Ключ от старой каюты',
    body: 'После того разговора об архиве {{parent}} достаёт из ящика маленький ключ: «От каюты, где мы жили до твоего рождения. Там уже давно никто не живёт, но кое-что осталось».',
    available: g => is(g, 'parentStage', 'recorded') && since(g, 'parentStageAge', 6) && alive(g, 'parent'),
    choices: [
      { text: 'Сходить туда вместе', hint: 'Близость ↑', result: 'Каюта почти пуста. На стене нацарапаны отметки роста. {{parent}} смотрит на них молча, а потом показывает первую: твою.', effects: { stats: { bonds: 6, morale: 5 }, bonds: { parent: 8 }, flags: { parentStage: 'keepsake' }, memory: 'Старая каюта с отметками роста на стене.' } },
      { text: 'Пойти одному', hint: 'Тишина', result: 'Ты стоишь в пустой комнате, слушаешь, как гудит вентиляция, и понимаешь, что знал этот звук с рождения.', effects: { stats: { morale: 3, stress: -3 }, bonds: { parent: 2 } } },
      { text: 'Попросить передать ключ тебе', hint: 'Наследие', result: '{{parent}} кладёт ключ тебе в ладонь, не спрашивая зачем. «Потом, — говорит. — Когда будет нужно».', effects: { stats: { bonds: 3 }, bonds: { parent: 4 }, flags: { parentStage: 'keepsake' } } }
    ]
  },
  {
    id: 'parent-regret', arc: 'parent', category: 'Последствие', min: 34, max: 85, weight: 16,
    title: 'Несказанное',
    body: 'Спустя годы {{parent}} вдруг упоминает тот день, когда ты обещал заглянуть и разобрать архив. Говорит спокойно, без упрёка. Но именно спокойствие больнее всего.',
    available: g => is(g, 'parentStage', 'postponed') && since(g, 'parentStageAge', 6) && alive(g, 'parent'),
    choices: [
      { text: 'Извиниться и сесть за фотографии прямо сейчас', hint: 'Исправление', result: 'Времени уходит меньше, чем ты боялся. Родитель рассказывает сразу о десятке людей, и ты едва успеваешь записывать.', effects: { stats: { morale: 3, bonds: 4, knowledge: 2 }, bonds: { parent: 8 }, flags: { parentStage: 'repaired' }, memory: 'Поздний вечер над семейными фотографиями вместе с родителем.' } },
      { text: 'Сказать, что не было времени', hint: 'Оправдание', result: '{{parent}} кивает: «Понимаю». Но больше этой темы не поднимает, и вы оба делаете вид, что её никогда не было.', effects: { stats: { stress: 3, bonds: -2 }, bonds: { parent: -4 } } },
      { text: 'Промолчать', hint: 'Дистанция', result: 'Ты киваешь и переводишь разговор на другое. Вечером долго не можешь вспомнить, о чём вы потом говорили.', effects: { stats: { stress: 4, morale: -2 }, bonds: { parent: -3 }, memory: 'Нетронутый семейный архив, к которому так и не вернулись.' } }
    ]
  },
  {
    id: 'parent-treatment', arc: 'parent', category: 'Семья', min: 28, max: 75, weight: 20,
    title: 'Курс лечения',
    body: 'Медики предлагают {{parent}} три пути: стандартный курс, который даёт спокойные годы, но без больших надежд; экспериментальную программу, о которой мало известно; или домашний уход без вмешательств. Решение просят принять вместе с тобой.',
    available: g => is(g, 'parentCare', 'medical') && since(g, 'parentAge', 3) && !g.flags.parentTreatment,
    choices: [
      { text: 'Стандартный курс', hint: 'Спокойствие · Без риска', result: 'Курс проходит ровно. {{parent}} устаёт, но держится, и вы возвращаетесь к обычному ритму.', effects: { stats: { stress: 2, morale: 1 }, bonds: { parent: 4 }, flags: { parentTreatment: 'standard' } } },
      { text: 'Экспериментальная программа', hint: 'Риск · Медицина', result: 'Ты берёшь на себя сопровождение: учишь протокол, ночуешь в клинике, споришь с врачами.', effects: { stats: { stress: 6 }, skills: { medicine: 4 }, flags: { parentTreatment: 'experimental' } }, check: { skill: 'medicine', difficulty: 18, successText: 'Программа даёт неожиданно хороший результат. {{parent}} возвращается домой с новой энергией, а врачи отмечают твой вклад.', failureText: 'Программа не оправдала надежд. {{parent}} слабеет, но вы оба знаете, что попробовали всё.', success: { stats: { morale: 6, reputation: 4 }, bonds: { parent: 10 }, memory: 'Экспериментальный курс лечения родителя закончился неожиданным успехом.' }, failure: { stats: { morale: -5, stress: 4 }, bonds: { parent: 5 }, memory: 'Месяцы борьбы за здоровье родителя, которые не принесли облегчения.' } } },
      { text: 'Домашний уход', hint: 'Присутствие', result: 'Ты перестраиваешь жизнь вокруг тихих вечеров, чая и разговоров. Врачи не одобряют, но {{parent}} сияет впервые за долгое время.', effects: { stats: { bonds: 6, morale: 3, stress: 3, reputation: -2 }, bonds: { parent: 10 }, flags: { parentTreatment: 'home' }, memory: 'Тихие вечера рядом с родителем в последние годы.' } }
    ]
  },
  {
    id: 'parent-letter', arc: 'parent', category: 'Семья', min: 28, max: 75, weight: 14,
    title: 'Письмо от родителя',
    body: 'От {{parent}} приходит короткое письмо. Ни просьбы, ни упрёка, только пара строк о том, что сад в секторе зацвёл, и вопрос: «Ты не заходил бы как-нибудь?»',
    available: g => is(g, 'parentCare', 'distant') && since(g, 'parentAge', 6) && !g.flags.parentLetter,
    choices: [
      { text: 'Прийти в тот же вечер', hint: 'Примирение', result: '{{parent}} открывает дверь так, будто ждал давно. За чаем вы говорите обо всём, кроме главного, и это самое тёплое за много лет.', effects: { stats: { bonds: 6, morale: 5, stress: -3 }, bonds: { parent: 14 }, flags: { parentLetter: 'visited', parentStage: 'reconciled', parentStageAge: NOW }, memory: 'Вечер, когда после долгой разлуки пришёл к родителю.' } },
      { text: 'Написать ответ', hint: 'Осторожность', result: 'Письмо получается неловким. Родитель отвечает через неделю, и вы начинаете переписываться: коротко, редко, но без пауз.', effects: { stats: { bonds: 3 }, bonds: { parent: 6 }, flags: { parentLetter: 'wrote', parentStage: 'written', parentStageAge: NOW } } },
      { text: 'Не отвечать', hint: 'Дистанция', result: 'Ты откладываешь письмо в ящик. Через месяц забываешь. Через год вспоминаешь и не знаешь, что сказать.', effects: { stats: { stress: 2, morale: -2 }, bonds: { parent: -6 }, flags: { parentLetter: 'ignored', parentStage: 'silent', parentStageAge: NOW } } }
    ]
  },
  {
    id: 'parent-last-call', arc: 'parent', category: 'Семья', min: 36, max: 85, weight: 16,
    title: 'Спросили про тебя',
    body: 'Соседка {{parent}} звонит и говорит, что {{parent}} часто спрашивает о тебе, но «просить прийти не будет». Просит не рассказывать, что она звонила.',
    available: g => is(g, 'parentStage', 'silent') && since(g, 'parentStageAge', 6) && alive(g, 'parent'),
    choices: [
      { text: 'Прийти прямо сейчас', hint: 'Исправление', result: 'Дверь открывается медленно. {{parent}} заметно постарела. Минуту вы молчите, потом разговор находит сам себя.', effects: { stats: { bonds: 5, morale: 4, stress: -2 }, bonds: { parent: 12 }, flags: { parentStage: 'reached' }, memory: 'Визит к родителю после звонка соседки.' } },
      { text: 'Отправить сообщение', hint: 'Полумера', result: 'Ответ приходит за час: два слова и подпись. Ты долго смотришь на них, не зная, радоваться или нет.', effects: { stats: { bonds: 2 }, bonds: { parent: 4 } } },
      { text: 'Сделать вид, что не слышал', hint: 'Дистанция', result: 'Ты благодаришь соседку и кладёшь трубку. Вечером перебираешь в голове все причины, и ни одна не кажется достаточной.', effects: { stats: { stress: 5, morale: -4 }, bonds: { parent: -5 }, memory: 'Звонок соседки, после которого визита к родителю так и не последовало.' } }
    ]
  },

  // ═════════ СОСЕД ═════════
  {
    id: 'neighbor-followup', arc: 'neighbor', category: 'Последствие', min: 28, max: 80, weight: 12,
    title: 'Соседняя дверь',
    body: 'Спустя годы {{neighbor}} сообщает, что освободилась небольшая каюта с видом на биокупол. О таких предложениях обычно узнают только по знакомству.',
    available: g => is(g, 'neighborPath', 'helped') && since(g, 'neighborAge', 8) && !g.flags.neighborStage,
    choices: [
      { text: 'Переехать поближе к саду', hint: 'Самочувствие ↑ · Новые связи', result: 'В новом коридоре пахнет влажной землёй. Иногда это почти напоминает воздух с исторических записей о Земле.', effects: { stats: { morale: 7, bonds: 3 }, flags: { neighborStage: 'moved', neighborStageAge: NOW }, memory: 'Переехал в каюту у биокупола благодаря давней дружбе.' } },
      { text: 'Передать предложение другой семье', hint: 'Репутация ↑ · Отношения', result: 'Каюта достаётся семье, которой она нужнее. {{neighbor}} понимающе кивает.', effects: { stats: { reputation: 5, morale: 3 }, bonds: { neighbor: 3 }, flags: { neighborStage: 'passed', neighborStageAge: NOW } } },
      { text: 'Остаться дома', hint: 'Стабильность', result: 'Ты благодаришь соседа. Своя старая каюта тоже хранит много хороших воспоминаний.', effects: { stats: { morale: 2 }, flags: { neighborStage: 'stayed', neighborStageAge: NOW } } }
    ]
  },
  {
    id: 'neighbor-kid-moved', arc: 'neighbor', category: 'Последствие', min: 34, max: 88, weight: 14,
    title: 'Ужин у биокупола',
    body: 'Ребёнок, с которым ты когда-то сидел по просьбе {{neighbor}}, давно вырос и работает в биокуполе. Он приглашает тебя на ужин: «Вы мне тогда читали вслух. Я до сих пор помню слова».',
    available: g => is(g, 'neighborStage', 'moved') && since(g, 'neighborStageAge', 8),
    choices: [
      { text: 'Прийти и рассказать истории', hint: 'Тепло', result: 'Стол накрыт под настоящими яблонями. Вы говорите допоздна, и ты впервые чувствуешь, что оставил за собой не только дела, но и людей.', effects: { stats: { morale: 6, bonds: 4 }, bonds: { neighbor: 5 }, memory: 'Ужин под яблонями с тем самым ребёнком из соседней каюты.' } },
      { text: 'Взять ученика в садовую бригаду', hint: 'Наследие', result: 'Через месяц вы вдвоём на смене, и твои руки вспоминают всё, чему ты когда-то учился.', effects: { skills: { ecology: 3 }, stats: { morale: 4, reputation: 2 } } },
      { text: 'Вежливо отказаться', hint: 'Дистанция', result: 'Ты ссылаешься на усталость. Он кивает, но в голосе слышна лёгкая обида.', effects: { stats: { stress: -1 }, bonds: { neighbor: -2 } } }
    ]
  },
  {
    id: 'neighbor-kid-passed', arc: 'neighbor', category: 'Последствие', min: 34, max: 88, weight: 14,
    title: 'Ответная доброта',
    body: 'Семья, которой ты когда-то уступил каюту у биокупола, давно прижилась. В трудную неделю, когда ты слёг, у твоей двери появляется кастрюля с супом, а на ней записка: «От тех, кому вы помогли».',
    available: g => is(g, 'neighborStage', 'passed') && since(g, 'neighborStageAge', 8),
    choices: [
      { text: 'Зайти поблагодарить лично', hint: 'Дружба ↑', result: 'За чаем выясняется, что у семьи уже есть традиция: раз в год они приносят суп тем, кто остался один. Тебя записывают в список.', effects: { stats: { morale: 5, bonds: 4, health: 2 }, bonds: { neighbor: 3 }, memory: 'Суп под дверью от семьи, которой когда-то уступили каюту.' } },
      { text: 'Оставить банку варенья и записку', hint: 'Скромность', result: 'Ты не ищешь повода для разговора, но записка приходит ответом: «Спасибо, что не забыли».', effects: { stats: { morale: 3, bonds: 2 } } },
      { text: 'Сделать вид, что не заметил', hint: 'Дистанция', result: 'Кастрюля остаётся на полу до вечера. Потом ты забираешь её и возвращаешь вымытой, но молча.', effects: { stats: { stress: 1, morale: -1 } } }
    ]
  },
  {
    id: 'neighbor-kid-stayed', arc: 'neighbor', category: 'Последствие', min: 34, max: 88, weight: 12,
    title: 'Стук в старую дверь',
    body: 'Ребёнок, которого ты когда-то нянчил, вырос и стал техником. Он стучит в дверь с коробкой инструментов: «Мне сказали, у вас давно скрипит вентиляция. Позвольте, я посмотрю».',
    available: g => is(g, 'neighborStage', 'stayed') && since(g, 'neighborStageAge', 8),
    choices: [
      { text: 'Пригласить войти', hint: 'Тепло', result: 'Он чинит вентиляцию за полчаса, а потом остаётся на чай. Каюта впервые за годы кажется шумнее, но уютнее.', effects: { stats: { morale: 5, bonds: 3 }, bonds: { neighbor: 4 } } },
      { text: 'Сказать, что справишься сам', hint: 'Гордость', result: 'Он пожимает плечами и уходит. Вентиляция скрипит ещё неделю, пока ты сам не лезешь чинить.', effects: { stats: { stress: 2 }, skills: { engineering: 1 } } },
      { text: 'Попросить научить тебя', hint: 'Любопытство', result: 'Он сначала растерян, потом вдохновлён. Вы проводите вечер над схемами, и ты вспоминаешь, как это бывает, когда учишься у того, кого сам когда-то учил читать.', effects: { stats: { knowledge: 3, morale: 4, bonds: 2 }, skills: { engineering: 2 } } }
    ]
  },
  {
    id: 'neighbor-weekend', arc: 'neighbor', category: 'Последствие', min: 26, max: 80, weight: 12,
    title: 'Просьба повторяется',
    body: '{{neighbor}} просит присмотреть за детьми на выходные: у семьи неотложные дела. С тех пор, как ты тогда нашёл замену, просьба повторяется, и отказать теперь немного неловко.',
    available: g => is(g, 'neighborPath', 'alt') && since(g, 'neighborAge', 6) && !g.flags.neighborStage,
    choices: [
      { text: 'Согласиться', hint: 'Доверие ↑ · Стресс ↑', result: 'Двое суток проходят в играх, разлитом молоке и бесконечных вопросах. Ты устаёшь, но дети прощаются так, будто знали тебя всегда.', effects: { stats: { stress: 5, bonds: 3, morale: 2 }, bonds: { neighbor: 10 }, flags: { neighborStage: 'carer', neighborStageAge: NOW } } },
      { text: 'Предложить сменный график', hint: 'Компромисс', result: 'Ты берёшь на себя один вечер в неделю. Выходит ровно, и просьбы появляются реже.', effects: { stats: { bonds: 2 }, bonds: { neighbor: 5 }, flags: { neighborStage: 'rota', neighborStageAge: NOW } } },
      { text: 'Вежливо отказать', hint: 'Дистанция', result: '{{neighbor}} понимающе кивает, но просьб больше не поступает. Пространство между дверями становится чуть шире.', effects: { stats: { stress: -2 }, bonds: { neighbor: -4 }, flags: { neighborStage: 'distanced', neighborStageAge: NOW } } }
    ]
  },
  {
    id: 'neighbor-cold-leak', arc: 'neighbor', category: 'Последствие', min: 26, max: 85, weight: 18,
    title: 'Течь за стеной',
    body: 'Ночью слышен плеск воды: у {{neighbor}} прорвало трубу, а хозяина нет дома: ночная смена. Вода уже подходит к твоей стене. Вы холодны друг с другом с тех пор, как ты отказался помочь.',
    available: g => is(g, 'neighborPath', 'refused') && since(g, 'neighborAge', 5) && !g.flags.neighborStage,
    choices: [
      { text: 'Перекрыть воду и убрать как можно больше', hint: 'Помощь вопреки обиде', result: 'Ты работаешь до утра. {{neighbor}} возвращается и стоит в дверях, не находя слов. «Это значит для меня очень много», — говорит наконец {{neighbor}}.', effects: { stats: { stress: 4, reputation: 3, morale: 2 }, bonds: { neighbor: 16 }, flags: { neighborStage: 'reconciled', neighborStageAge: NOW }, memory: 'Ночь, когда пришли на помощь соседу, с которым давно были в ссоре.' } },
      { text: 'Вызвать аварийную службу', hint: 'Осторожность', result: 'Бригада приезжает через полчаса и справляется. Ты не вмешивался напрямую, но и не остался равнодушным. {{neighbor}} благодарит коротко, без тепла.', effects: { stats: { stress: 1 }, bonds: { neighbor: 3 }, flags: { neighborStage: 'formal', neighborStageAge: NOW } } },
      { text: 'Не вмешиваться', hint: 'Дистанция', result: 'Ты закрываешь дверь и затыкаешь щель полотенцем. Утром {{neighbor}} молча выносит вёдра. Больше вы не заговариваете.', effects: { stats: { stress: 3, morale: -3, reputation: -2 }, bonds: { neighbor: -10 }, flags: { neighborStage: 'estranged', neighborStageAge: NOW }, memory: 'Ночь, когда соседу так и не помогли с прорвавшейся трубой.' } }
    ]
  },
  {
    id: 'neighbor-reconcile', arc: 'neighbor', category: 'Последствие', min: 34, max: 88, weight: 14,
    title: 'Пирог через стену',
    body: 'На твоём столе оказывается пирог. Записка короткая: «Просто так». Ты помнишь ту ночь с трубой, и {{neighbor}}, судя по всему, тоже.',
    available: g => is(g, 'neighborStage', 'reconciled') && since(g, 'neighborStageAge', 6),
    choices: [
      { text: 'Пойти благодарить', hint: 'Дружба ↑', result: 'За чаем {{neighbor}} рассказывает, о чём молчал: о долгах и тревогах. Ты слушаешь, и разговор растягивается на вечер.', effects: { stats: { bonds: 5, morale: 4 }, bonds: { neighbor: 8 } } },
      { text: 'Ответить своим пирогом', hint: 'Игра', result: 'Через неделю обмен повторяется. Вы оба делаете вид, что это случайность, и оба знаете, что нет.', effects: { stats: { morale: 3, bonds: 2 }, bonds: { neighbor: 4 } } }
    ]
  },

  // ═════════ ЛЮБОВЬ ═════════
  {
    id: 'relationship-followup', arc: 'love', category: 'Последствие', min: 24, max: 75, weight: 12,
    title: 'Разговор о будущем',
    body: 'В личном дневнике {{friend}} находит старую запись о вашем разговоре в обзорном куполе. Вас обоих пугает, сколько времени пролетело.',
    available: g => is(g, 'lovePath', 'confessed') && g.age >= 27 && !g.flags.loveStage && alive(g, 'friend'),
    choices: [
      { text: 'Серьёзно обсудить совместную жизнь', hint: 'Связи ↑ · Долгосрочное решение', result: 'Вы решаете жить вместе. Крошечное пространство вашей каюты неожиданно становится уютным.', effects: { stats: { bonds: 10, morale: 7 }, bonds: { friend: 14 }, flags: { livingTogether: true, loveStage: 'together', loveStageAge: NOW }, memory: 'Решение построить совместную жизнь с близким человеком.' } },
      { text: 'Оставить всё как есть', hint: 'Спокойствие', result: 'Вы выбираете собственный ритм, не давая друг другу обещаний.', effects: { stats: { morale: 2 }, flags: { loveStage: 'open', loveStageAge: NOW } } },
      { text: 'Признать, что ваши пути расходятся', hint: 'Боль сейчас · Новое начало', result: 'Это тяжёлый разговор, но никто из вас не пытается удержать другого силой.', effects: { stats: { morale: -8, stress: 6 }, bonds: { friend: -12 }, flags: { loveStage: 'parted', loveStageAge: NOW }, memory: 'Расставание, которое больше не подходило обоим.' } }
    ]
  },
  {
    id: 'love-home-offer', arc: 'love', category: 'Последствие', min: 30, max: 80, weight: 16,
    title: 'Предложение о переезде',
    body: 'Близкому человеку предлагают работу в другом секторе: больше возможностей, но жильё там выдают только по месту службы. Предлагают переехать вместе, но тогда придётся уйти с твоего привычного места.',
    available: g => is(g, 'loveStage', 'together') && since(g, 'loveStageAge', 5) && alive(g, 'friend'),
    choices: [
      { text: 'Переехать вместе', hint: 'Отношения ↑ · Карьера ↓', result: 'Новое место встречает тесной каютой и чужими коридорами. Но вечером, возвращаясь, ты видишь, что дверь не заперта, и понимаешь, что дом там, где вас двое.', effects: { stats: { bonds: 6, morale: 4, reputation: -4, stress: 4 }, bonds: { friend: 8 }, flags: { loveStage: 'moved-together', loveStageAge: NOW }, memory: 'Переезд в другой сектор вслед за близким человеком.' } },
      { text: 'Попросить остаться', hint: 'Карьера ↑ · Отношения ↓', result: 'Близкий человек молчит долго. Потом соглашается, но в каюте с тех пор слышнее тиканье часов.', effects: { stats: { bonds: -5, stress: 4, reputation: 2 }, bonds: { friend: -8 }, flags: { loveStage: 'held', loveStageAge: NOW } } },
      { text: 'Предложить пожить врозь год', hint: 'Компромисс · Риск', result: 'Вы расходитесь без обид и условий, договорившись встречаться по выходным. Первое время это даже забавляет.', effects: { stats: { morale: -1, stress: 2, reputation: 3 }, bonds: { friend: -2 }, flags: { loveStage: 'apart', loveStageAge: NOW } } }
    ]
  },
  {
    id: 'love-drift', arc: 'love', category: 'Последствие', min: 30, max: 80, weight: 16,
    title: 'Новое лицо',
    body: '{{friend}} начинает чаще упоминать нового коллегу: невзначай, между делом. Вы так и не называли своё положение словами, и теперь нет никого, кто мог бы сказать, что что-то нарушено.',
    available: g => is(g, 'loveStage', 'open') && since(g, 'loveStageAge', 6) && alive(g, 'friend'),
    choices: [
      { text: 'Сказать, что чувствуешь', hint: 'Честность · Риск', result: 'Слова даются трудно. Выясняется, что {{friend}} давно ждал именно этих слов. Но и что у ваших ожиданий были разные формы.', effects: { stats: { morale: 3, stress: 3, bonds: 3 }, bonds: { friend: 6 }, flags: { loveStage: 'spoken' } } },
      { text: 'Отпустить без разговора', hint: 'Спокойствие · Потеря', result: 'Вы продолжаете здороваться. Вскоре ты замечаешь, что давно не приходишь первым.', effects: { stats: { morale: -4, stress: 2 }, bonds: { friend: -6 }, flags: { loveStage: 'drifted' }, memory: 'Медленное расхождение с близким человеком без единого слова об этом.' } },
      { text: 'Сделать вид, что ничего не происходит', hint: 'Самообман', result: 'Ты продолжаешь вести себя как раньше. {{friend}} благодарно улыбается, но с каждым месяцем всё больше времени проводит в другом секторе.', effects: { stats: { stress: 3, morale: -2 }, bonds: { friend: -3 }, flags: { loveStage: 'drifted' } } }
    ]
  },
  {
    id: 'love-parted-meeting', arc: 'love', category: 'Последствие', min: 34, max: 85, weight: 14,
    title: 'Встреча в атриуме',
    body: 'В атриуме ты замечаешь {{friend}} с кем-то, кто явно близок: рядом ребёнок, на руках тёплая куртка. Прошло много лет. {{friend}} замечает тебя и неуверенно машет.',
    available: g => is(g, 'loveStage', 'parted') && since(g, 'loveStageAge', 8) && alive(g, 'friend'),
    choices: [
      { text: 'Подойти и поздороваться', hint: 'Спокойствие', result: 'Разговор получается короткий и тёплый. Ты видишь, что у {{friend}} всё хорошо, и чувствуешь неожиданное облегчение.', effects: { stats: { morale: 4, stress: -3 }, bonds: { friend: 5 }, memory: 'Встреча со старой любовью спустя годы: у обоих всё сложилось.' } },
      { text: 'Кивнуть издали', hint: 'Дистанция', result: 'Ты поднимаешь руку и идёшь дальше. Что-то внутри слегка ноет, но быстро затихает.', effects: { stats: { stress: 1, morale: -1 } } },
      { text: 'Пригласить на чай при случае', hint: 'Открытость', result: '{{friend}} улыбается и обещает как-нибудь зайти. Заходит через полгода: вдвоём вы вспоминаете, как смешно всё начиналось.', effects: { stats: { morale: 3, bonds: 3 }, bonds: { friend: 6 } } }
    ]
  },
  {
    id: 'love-friends-union', arc: 'love', category: 'Последствие', min: 26, max: 70, weight: 14,
    title: 'Приглашение на свадьбу',
    body: '{{friend}} приглашает тебя на торжество: союз с человеком из соседнего сектора. Приглашение тёплое, но среди имён в списке гостей ты находишь своё не в первом ряду.',
    available: g => is(g, 'lovePath', 'friends') && since(g, 'loveAge', 6) && !g.flags.loveStage && alive(g, 'friend'),
    choices: [
      { text: 'Прийти и поздравить', hint: 'Дружба ↑', result: 'Торжество шумное и тёплое. Ты смеёшься, танцуешь и впервые понимаешь, что прошлая ночь у купола стоила не сожалений, а доброй памяти.', effects: { stats: { morale: 5, bonds: 4 }, bonds: { friend: 6 }, flags: { loveStage: 'attended', loveStageAge: NOW } } },
      { text: 'Отправить подарок и извинения', hint: 'Дистанция', result: 'Подарок принимают с благодарностью. Но вы оба знаете: некоторые двери закрылись, хотя никто их не захлопывал.', effects: { stats: { stress: -1 }, bonds: { friend: -2 }, flags: { loveStage: 'absent', loveStageAge: NOW } } },
      { text: 'Отказаться без объяснений', hint: 'Боль', result: 'Ты не отвечаешь на приглашение. День торжества проходит так, будто ничего не происходит. Вечером становится слишком тихо.', effects: { stats: { stress: 4, morale: -4 }, bonds: { friend: -8 }, flags: { loveStage: 'absent', loveStageAge: NOW }, memory: 'Торжество друга, на которое так и не пришли.' } }
    ]
  },
  {
    id: 'love-missed', arc: 'love', category: 'Последствие', min: 34, max: 85, weight: 14,
    title: 'Что осталось недосказанным',
    body: 'Случайная встреча со старым другом растягивается на целый вечер. Под конец {{friend}} признаётся: «Тогда у купола мне тоже было что сказать. Просто ты быстро сменил тему».',
    available: g => is(g, 'lovePath', 'skipped') && since(g, 'loveAge', 10) && !g.flags.loveStage && alive(g, 'friend'),
    choices: [
      { text: 'Признаться, что хотел бы вернуться в тот вечер', hint: 'Честность', result: '{{friend}} долго молчит, а потом улыбается: «Хорошо, что хоть сейчас». Вы расходитесь поздно, не обещая ничего, но и не прощаясь по-настоящему.', effects: { stats: { morale: 4, stress: 2, bonds: 3 }, bonds: { friend: 8 }, flags: { loveStage: 'late-honest', loveStageAge: NOW }, memory: 'Поздний разговор о несказанном вечере у обзорного купола.' } },
      { text: 'Сказать, что всё к лучшему', hint: 'Защита', result: 'Ты говоришь привычные слова. {{friend}} кивает: «Наверное». Домой ты идёшь пешком, и дорога оказывается длиннее обычного.', effects: { stats: { stress: 3, morale: -3 }, bonds: { friend: -2 }, flags: { loveStage: 'late-closed', loveStageAge: NOW } } },
      { text: 'Рассмеяться и перевести разговор', hint: 'Ирония', result: 'Смех получается лёгким, почти настоящим. Вы оба знаете, что обошли что-то важное, но вечер от этого не становится хуже.', effects: { stats: { morale: 1 }, flags: { loveStage: 'late-closed', loveStageAge: NOW } } }
    ]
  }
]
