import type { MomentDef } from './types'
import { extraMoments } from './momentsExtra'
import { mysteryMoments } from './storyletsMystery'
import { compileMoment } from '../content/load'
import bundle from '../content/bundle.json'
import type { ContentBundle } from '../content/types'

const ONCE = Infinity

/**
 * Моменты — маленькие возможности внутри года. Не останавливают время; принять момент стоит единицу личного времени.
 * Они не заменяют сюжетные решения, а наполняют годы мелкими поступками и подпитывают сюжетные флаги.
 */
const baseMoments: MomentDef[] = [
  // — детство —
  {
    id: 'm-window-child', spot: 'window', title: 'Звёзды за стеклом', min: 3, max: 14, weight: 3, cooldown: 5,
    text: 'Свет в каюте приглушён, и за обзорным стеклом особенно хорошо видна далёкая яркая точка. Взрослые говорят, что это цель полёта.',
    accept: { label: 'Подойти и смотреть', result: 'Ты долго не отходишь от окна. Точка не приближается, но начинает казаться знакомой.', effects: { stats: { knowledge: 2, morale: 2 }, flags: { destinationCurious: true } } },
    skip: { label: 'Вернуться к игре' }
  },
  {
    id: 'm-story', spot: 'parent', title: 'История перед сном', min: 3, max: 11, weight: 3, cooldown: 3, needs: ['parent'],
    text: '{{parent}} предлагает рассказать историю о Земле, пока в коридоре не погас свет.',
    accept: { label: 'Слушать до конца', result: 'Ты засыпаешь на середине, но помнишь запах бумаги и голос, которым говорили о дожде.', effects: { stats: { morale: 3 }, bonds: { parent: 4 } } },
    skip: { label: 'Сказать, что не хочется' }
  },
  {
    id: 'm-neighbor-radio', spot: 'door', title: 'Стук в дверь', min: 4, max: 14, weight: 2, cooldown: 4, needs: ['neighbor'],
    text: 'За дверью топчется {{neighbor}} с коробкой деталей от старого радио. Кажется, {{neighbor:ему|ей}} нужен кто-то для затеи.',
    accept: { label: 'Открыть и помочь', result: 'К вечеру радио хрипит, как простуженное, но что-то в нём играет. {{neighbor}} сияет.', effects: { skills: { engineering: 1 }, stats: { knowledge: 1, bonds: 2 }, bonds: { neighbor: 5 } } },
    skip: { label: 'Сказать, что занят{{hero:|а}}' }
  },
  {
    id: 'm-terminal-copy', spot: 'terminal', title: 'Терминал без подписи', min: 7, max: 15, weight: 2, cooldown: ONCE,
    text: 'Школьный терминал остался включённым. В списке файлов — папка без названия, с записями, которые обычно закрывают.',
    accept: { label: 'Скопировать на память', result: 'Ты прячешь копию среди домашних заданий. Сердце стучит громче вентиляции.', effects: { stats: { knowledge: 3, stress: 2 }, flags: { archiveCopy: true }, memory: 'Тайком скопировал{{hero:|а}} закрытую папку со школьного терминала.' } },
    skip: { label: 'Выключить и уйти' }
  },
  {
    id: 'm-friend-run', spot: 'door', title: 'Зов в коридоре', min: 6, max: 16, weight: 3, cooldown: 3, needs: ['friend'],
    text: '{{friend}} зовёт играть в «космонавтов» в техническом коридоре — туда, конечно, нельзя.',
    accept: { label: 'Бежать за другом', result: 'Вы успеваете проскочить до смены дежурного. Колени в синяках, настроение отличное.', effects: { stats: { morale: 3, stress: -1 }, bonds: { friend: 4 } } },
    skip: { label: 'Остаться дома' }
  },
  {
    id: 'm-laundry', spot: 'parent', title: 'Уставшие руки', min: 5, max: 16, weight: 2, cooldown: 4, needs: ['parent'],
    text: '{{parent}} возвращается с работы с усталым лицом и просит помочь разобрать бельё.',
    accept: { label: 'Помочь', result: 'Вдвоём получается быстрее. Родитель впервые за вечер улыбается.', effects: { stats: { stress: 1, bonds: 2 }, bonds: { parent: 4 } } },
    skip: { label: 'Сказать, что делаешь уроки' }
  },
  // — юность и взрослая жизнь —
  {
    id: 'm-night-archive', spot: 'terminal', title: 'Ночной архив', min: 13, max: 75, weight: 3, cooldown: 3,
    text: 'После смены свободный терминал снова зовёт: курс, который давно хотелось пройти.',
    accept: { label: 'Пройти пару уроков', result: 'Голова гудит, но кое-что наконец встаёт на места.', effects: { stats: { knowledge: 3, stress: 1 } } },
    skip: { label: 'Лечь спать', effects: { stats: { stress: -1 } } }
  },
  {
    id: 'm-window-evening', spot: 'window', title: 'Вечер у стекла', min: 14, max: 90, weight: 3, cooldown: 4,
    text: 'Все разошлись по каютам. У обзорного стекла почти никого, только далёкая точка, которая не меняется много лет.',
    accept: { label: 'Постоять у окна', result: 'Мысли не стали ясными, но стали тише.', effects: { stats: { stress: -4, morale: 2 } } },
    skip: { label: 'Пройти мимо' }
  },
  {
    id: 'm-friend-call', spot: 'table', title: 'Сообщение от друга', min: 15, max: 75, weight: 3, cooldown: 4, needs: ['friend'],
    available: g => (g.people.find(p => p.id === 'friend')?.bond ?? 0) >= 25 && g.flags.friendState !== 'estranged',
    text: '{{friend}} пишет: «Давно не виделись. Выйдешь на чай из биокупола?»',
    accept: { label: 'Встретиться', result: 'Разговор начинается с погоды, а заканчивается далеко за полночь.', effects: { stats: { morale: 3, stress: -2, bonds: 2 }, bonds: { friend: 4 } } },
    skip: { label: 'Отложить на потом' }
  },
  {
    id: 'm-neighbor-tool', spot: 'door', title: 'Просьба через стенку', min: 18, max: 80, weight: 2, cooldown: 5, needs: ['neighbor'],
    text: '{{neighbor}} просит одолжить инструмент. Мелочь, но вечер у тебя уже занят.',
    accept: { label: 'Выручить', result: '«Верну завтра», — говорит {{neighbor}}. Вернёт, и ещё принесёт что-нибудь к чаю.', effects: { stats: { reputation: 1, bonds: 1 }, bonds: { neighbor: 3 } } },
    skip: { label: 'Сослаться на дела' }
  },
  {
    id: 'm-call-parent', spot: 'table', title: 'Звонок родителю', min: 18, max: 65, weight: 3, cooldown: 3, needs: ['parent'],
    text: '{{parent}} звонит просто так — спросить, ел ли ты сегодня.',
    accept: { label: 'Заехать в гости', result: 'Чай, старые шутки и пирог, который почти удался. Уходить не хочется.', effects: { stats: { morale: 2, stress: -1 }, bonds: { parent: 4 } } },
    skip: { label: 'Ответить коротко', effects: { stats: { bonds: -1 } } }
  },
  {
    id: 'm-mentor-schema', spot: 'door', title: 'Пять минут наставника', min: 17, max: 45, weight: 2, cooldown: 6, needs: ['mentor'],
    text: '{{mentor}} машет из конца коридора: «Есть пять минут? Хочу показать одну схему».',
    accept: { label: 'Пойти за наставником', result: 'Пять минут превращаются в час. Ты уходишь с исписанным листом и странным чувством, что тебя заметили.', effects: { stats: { knowledge: 2, reputation: 1 }, bonds: { mentor: 4 } } },
    skip: { label: 'Сослаться на смену' }
  },
  {
    id: 'm-lamp', spot: 'table', title: 'Лампа и чай', min: 20, max: 85, weight: 3, cooldown: 3,
    text: 'Вечер, тёплая лампа, горячая кружка. Никаких срочных дел — это случается реже, чем кажется.',
    accept: { label: 'Посидеть без дел', result: 'Ты просто сидишь. За окном ничего не происходит, и это замечательно.', effects: { stats: { stress: -5, health: 1 } } },
    skip: { label: 'Найти, чем заняться' }
  },
  {
    id: 'm-work-queue', spot: 'terminal', title: 'Рабочая сводка', min: 18, max: 62, weight: 2, cooldown: 3,
    text: 'В очереди задач висит неприметный пункт, который никто не хочет брать. Зато он давно просится быть закрытым.',
    accept: { label: 'Разобрать задачи', result: 'Ничего героического, но к вечеру список короче, а ты в хорошем смысле заметнее.', effects: { stats: { reputation: 2, stress: 2 } } },
    skip: { label: 'Оставить на завтра' }
  },
  {
    id: 'm-sibling', spot: 'table', title: 'Старший заходит на чай', min: 4, max: 65, weight: 2, cooldown: 4, needs: ['sibling'],
    text: '{{sibling}} заглядывает «на минутку» и застревает на два часа.',
    accept: { label: 'Поболтать', result: 'Вы вспоминаете детство, и половина историй у вас рассказана по-разному.', effects: { stats: { morale: 2, bonds: 1 }, bonds: { sibling: 4 } } },
    skip: { label: 'Сказать, что занят{{hero:|а}}' }
  },
  {
    id: 'm-new-neighbors', spot: 'door', title: 'Новые соседи', min: 20, max: 60, weight: 1, cooldown: 8,
    text: 'В соседнюю каюту въезжает молодая пара. Один из них неловко тащит коробку и озирается.',
    accept: { label: 'Помочь с коробкой', result: 'Знакомство начинается с «осторожно, там посуда» и заканчивается приглашением на ужин.', effects: { stats: { bonds: 3, reputation: 1 } } },
    skip: { label: 'Кивнуть и пройти' }
  },
  {
    id: 'm-sprout', spot: 'plant', title: 'Росток в горшке', min: 8, max: 80, weight: 2, cooldown: 6,
    text: 'Росток на подоконнике дал первый настоящий лист. Для такого горшка это почти подвиг.',
    accept: { label: 'Пересадить в горшок побольше', result: 'Ты возишься с землёй дольше, чем нужно. Лист потихоньку разворачивается.', effects: { skills: { ecology: 1 }, stats: { morale: 3 } } },
    skip: { label: 'Полить и забыть' }
  },
  {
    id: 'm-tiredness', spot: 'table', title: 'Лёгкая усталость', min: 25, max: 85, weight: 2, cooldown: 8,
    text: 'Утром тяжело вставать. Ничего страшного, но тело настойчиво просит внимания.',
    accept: { label: 'Сходить в клинику', result: 'Врач хмыкает, выписывает режим и предлагает чаще выходить в сад.', effects: { stats: { health: 4, stress: 1 } } },
    skip: { label: 'Перетерпеть', effects: { stats: { health: -1 } } }
  },
  {
    id: 'm-ship-notice', spot: 'terminal', title: 'Бортовое объявление', min: 20, max: 80, weight: 2, cooldown: 5,
    text: 'В бортовой ленте появляется длинное сообщение совета. Обычно такие никто не читает.',
    accept: { label: 'Прочитать до конца', result: 'Большая часть — формальности, но в середине пара строк о планах на следующие годы. Это стоит запомнить.', effects: { stats: { knowledge: 2 } } },
    skip: { label: 'Пролистать' }
  },
  {
    id: 'm-memory', spot: 'window', title: 'Давний вечер', min: 60, max: 100, weight: 3, cooldown: 4,
    text: 'Память подсовывает давний вечер у этого же стекла. Кто тогда стоял рядом?',
    accept: { label: 'Вспомнить подробнее', result: 'Ты вспоминаешь голоса, а не слова. И это почему-то важнее.', effects: { stats: { morale: 3, stress: -2 } } },
    skip: { label: 'Оставить в прошлом' }
  },
  // — реакции на прошлые решения —
  {
    id: 'm-friend-grudge', spot: 'door', title: 'Знакомая спина', min: 12, max: 60, weight: 4, cooldown: ONCE, needs: ['friend'],
    available: g => g.flags.abandonedFriend === true && !g.flags.friendReturn,
    text: '{{friend}} проходит мимо и делает вид, что не замечает. Вы оба помните тот день у школьного очистителя воды.',
    accept: { label: 'Окликнуть и извиниться', result: '{{friend}} останавливается не сразу. «Ты мог сказать это раньше», — отвечает {{friend}}, но не уходит.', effects: { stats: { stress: 2, morale: 1 }, bonds: { friend: 9 }, memory: 'Наш{{hero:ёл|ла}} слова, чтобы извиниться перед другом спустя годы.' } },
    skip: { label: 'Промолчать снова', effects: { bonds: { friend: -2 } } }
  },
  {
    id: 'm-friend-trust', spot: 'table', title: 'Доверие', min: 14, max: 60, weight: 4, cooldown: ONCE, needs: ['friend'],
    available: g => g.flags.stoodForFriend === true,
    text: '{{friend}} задерживается после занятий и говорит, что тебе можно рассказать кое-что. Что-то, чего не знают даже родители.',
    accept: { label: 'Выслушать', result: 'Разговор получается тихим, неловким и очень нужным. Вы оба знаете: этот день из тех, что запоминают.', effects: { stats: { bonds: 3, morale: 2 }, bonds: { friend: 8 } } },
    skip: { label: 'Сказать «потом»' }
  },
  {
    id: 'm-neighbor-jam', spot: 'door', title: 'Банка у двери', min: 20, max: 80, weight: 4, cooldown: ONCE, needs: ['neighbor'],
    available: g => g.flags.neighborHelped === true,
    text: 'У двери стоит банка густого биокупольного варенья. Записка: «За тот вечер. {{neighbor}}».',
    accept: { label: 'Зайти поблагодарить', result: 'За чаем {{neighbor}} вспоминает тот вечер так, будто сделал{{hero:|а}} ты что-то великое.', effects: { stats: { morale: 3, bonds: 2 }, bonds: { neighbor: 5 } } },
    skip: { label: 'Оставить как есть' }
  },
  {
    id: 'm-partner', spot: 'parent', title: 'Вечер вдвоём', min: 24, max: 90, weight: 5, cooldown: 3, needs: ['friend'],
    available: g => g.flags.livingTogether === true,
    text: 'В каюте тихо и тепло. Близкий человек придвигает второй стул к столу.',
    accept: { label: 'Остаться вместе', result: 'Вы почти не говорите, но вечер получается одним из лучших за этот год.', effects: { stats: { morale: 4, bonds: 3, stress: -2 } } },
    skip: { label: 'Заняться своим' }
  }
]

/** Моменты, написанные в коде. */
export const codeMoments: MomentDef[] = [...baseMoments, ...extraMoments, ...mysteryMoments]

/** Моменты из `content/moments/*.json` (см. `npm run content`). */
export const contentMoments: MomentDef[] = (bundle as unknown as ContentBundle).moments.map(compileMoment)

export const moments: MomentDef[] = [...codeMoments, ...contentMoments]

export const getMomentDef = (id: string | null) => (id ? moments.find(m => m.id === id) ?? null : null)
